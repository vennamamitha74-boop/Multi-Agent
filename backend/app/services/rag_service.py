import logging
import math
import os
import re
import uuid
from typing import Any, Dict, List, Optional
from qdrant_client import QdrantClient
from qdrant_client.http import models as qmodels

from app.config import settings

logger = logging.getLogger("rag_service")


class RAGService:
    """
    Retrieval-Augmented Generation service interfacing with Qdrant.
    Handles semantic search, representative chunk sampling, hybrid reranking,
    and grounded evidence retrieval.
    Connects to Qdrant Cloud when available; seamlessly falls back to embedded Qdrant on local disk/memory.
    """

    def __init__(self):
        self.client: Optional[QdrantClient] = None
        self.collection_name = settings.QDRANT_COLLECTION_NAME
        self.dimension = settings.EMBEDDING_DIMENSION
        self._init_client()

    def _init_client(self):
        # 1. Attempt connection to configured Qdrant Cloud cluster
        if settings.is_qdrant_configured():
            try:
                logger.info(f"Attempting connection to Qdrant Cloud at {settings.QDRANT_URL}...")
                client = QdrantClient(
                    url=settings.QDRANT_URL,
                    api_key=settings.QDRANT_API_KEY,
                    timeout=5
                )
                # Verify network reachability
                client.get_collections()
                self.client = client
                self._ensure_collection()
                logger.info(f"Qdrant Cloud client initialized successfully for collection: {self.collection_name}")
                return
            except Exception as e:
                logger.warning(f"Could not connect to remote Qdrant Cloud ({e}). Initializing embedded local Qdrant engine...")

        # 2. Resilient Fallback: Embedded local Qdrant engine (in-memory)
        try:
            self.client = QdrantClient(":memory:")
            self._ensure_collection()
            logger.info("Local embedded in-memory Qdrant client initialized successfully.")
        except Exception as e:
            logger.error(f"Failed to initialize in-memory Qdrant: {e}")
            self.client = None

    def _ensure_collection(self):
        if not self.client:
            return
        try:
            collections = [c.name for c in self.client.get_collections().collections]
            if self.collection_name not in collections:
                self.client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config=qmodels.VectorParams(
                        size=self.dimension,
                        distance=qmodels.Distance.COSINE
                    )
                )
                logger.info(f"Created Qdrant collection: {self.collection_name}")
            # Ensure keyword indexes for fast, filtered querying
            for field in ["user_id", "document_id"]:
                try:
                    self.client.create_payload_index(
                        collection_name=self.collection_name,
                        field_name=field,
                        field_schema=qmodels.PayloadSchemaType.KEYWORD
                    )
                except Exception:
                    pass
        except Exception as e:
            logger.warning(f"Could not verify or create collection: {e}")

    def get_embedding(self, text: str) -> List[float]:
        """
        Generates dense vector embeddings of size self.dimension (768).
        Uses deterministic semantic n-gram hashing with sublinear frequency scaling.
        """
        import hashlib

        vector = [0.0] * self.dimension
        tokens = re.findall(r"\b\w+\b", text.lower())
        if not tokens:
            return vector

        # Unigram frequency weighting
        for word_idx, word in enumerate(tokens):
            h = int(hashlib.sha256(word.encode("utf-8")).hexdigest(), 16)
            dim_idx = h % self.dimension
            weight = 1.0 / (1.0 + math.log(1 + word_idx))
            vector[dim_idx] += weight

        # Bigram weighting for phrases
        for idx in range(len(tokens) - 1):
            bg = f"{tokens[idx]}_{tokens[idx+1]}"
            h = int(hashlib.sha256(bg.encode("utf-8")).hexdigest(), 16)
            dim_idx = h % self.dimension
            vector[dim_idx] += 1.5

        # Normalize L2
        norm = math.sqrt(sum(x * x for x in vector))
        if norm > 0:
            vector = [x / norm for x in vector]

        return vector

    def _compute_lexical_overlap(self, query: str, content: str) -> float:
        """Computes lexical token overlap ratio between query and chunk content."""
        stopwords = {
            "the", "and", "is", "in", "it", "to", "of", "for", "with", "on", "at",
            "from", "by", "about", "as", "into", "like", "through", "after", "over",
            "between", "out", "against", "during", "without", "before", "under", "around",
            "tell", "me", "what", "does", "this", "that", "these", "those", "can", "you",
            "give", "show", "how", "why", "who", "which", "where", "when"
        }
        q_tokens = [w for w in re.findall(r"\b\w{3,}\b", query.lower()) if w not in stopwords]
        if not q_tokens:
            return 0.0

        c_tokens = set(re.findall(r"\b\w{3,}\b", content.lower()))
        matched = sum(1 for w in q_tokens if w in c_tokens)
        return matched / len(q_tokens)

    def get_document_chunks(self, document_id: str, limit: int = 100) -> List[Dict[str, Any]]:
        """
        Retrieves all chunks belonging to a document_id from Qdrant, ordered by chunk_index.
        """
        if not self.client:
            return []

        try:
            scroll_filter = qmodels.Filter(
                must=[
                    qmodels.FieldCondition(
                        key="document_id",
                        match=qmodels.MatchValue(value=document_id)
                    )
                ]
            )

            records, _ = self.client.scroll(
                collection_name=self.collection_name,
                scroll_filter=scroll_filter,
                limit=limit,
                with_payload=True,
                with_vectors=False
            )

            chunks = []
            for hit in records:
                payload = hit.payload or {}
                chunks.append({
                    "chunk_id": str(payload.get("chunk_id", hit.id)),
                    "document_id": payload.get("document_id", document_id),
                    "filename": payload.get("filename", "unknown"),
                    "page_number": payload.get("page_number", 1),
                    "section": payload.get("section", "Paragraph"),
                    "chunk_index": payload.get("chunk_index", 0),
                    "content": payload.get("content", ""),
                    "score": 1.0,
                    "metadata": payload
                })

            chunks.sort(key=lambda x: x["chunk_index"])
            return chunks
        except Exception as e:
            logger.error(f"Error fetching chunks for document {document_id}: {e}")
            return []

    def get_representative_chunks(self, document_id: str, max_chunks: int = 8) -> List[Dict[str, Any]]:
        """
        Retrieves representative chunks distributed across the document:
        start (intro/purpose), middle (key topics/architecture), and end (conclusions/summary).
        """
        all_chunks = self.get_document_chunks(document_id=document_id)
        if not all_chunks:
            return []

        if len(all_chunks) <= max_chunks:
            return all_chunks

        # Sample across the document
        selected_indices = set()
        # Always include the first chunks (document introduction & purpose)
        selected_indices.add(0)
        if len(all_chunks) > 1:
            selected_indices.add(1)

        # Always include the last chunk (summary / conclusion)
        selected_indices.add(len(all_chunks) - 1)

        # Distribute remaining slots evenly across the body
        remaining_slots = max_chunks - len(selected_indices)
        if remaining_slots > 0:
            step = (len(all_chunks) - 2) / (remaining_slots + 1)
            for i in range(1, remaining_slots + 1):
                idx = int(1 + i * step)
                if 0 <= idx < len(all_chunks):
                    selected_indices.add(idx)

        sampled = [all_chunks[i] for i in sorted(selected_indices)]
        return sampled

    def search_documents(
        self,
        query: str,
        user_id: Optional[str] = None,
        document_id: Optional[str] = None,
        top_k: int = 6
    ) -> List[Dict[str, Any]]:
        """
        Searches Qdrant collection for relevant evidence chunks using hybrid scoring (dense vector + lexical reranking).
        """
        if not self.client:
            logger.warning("Qdrant is not available; returning empty search results.")
            return []

        try:
            query_vector = self.get_embedding(query)
            filter_conditions = []
            if document_id:
                filter_conditions.append(
                    qmodels.FieldCondition(
                        key="document_id",
                        match=qmodels.MatchValue(value=document_id)
                    )
                )
            elif user_id and user_id != "anonymous_user":
                filter_conditions.append(
                    qmodels.FieldCondition(
                        key="user_id",
                        match=qmodels.MatchValue(value=user_id)
                    )
                )

            query_filter = qmodels.Filter(must=filter_conditions) if filter_conditions else None

            # Fetch candidate pool for reranking
            candidate_limit = max(top_k * 3, 12)
            results = []

            try:
                if hasattr(self.client, "query_points"):
                    response = self.client.query_points(
                        collection_name=self.collection_name,
                        query=query_vector,
                        query_filter=query_filter,
                        limit=candidate_limit
                    )
                    results = response.points
                elif hasattr(self.client, "search"):
                    results = self.client.search(
                        collection_name=self.collection_name,
                        query_vector=query_vector,
                        query_filter=query_filter,
                        limit=candidate_limit
                    )
            except Exception as e:
                logger.warning(f"Filtered query warning: {e}. Retrying query...")
                doc_filter = (
                    qmodels.Filter(
                        must=[qmodels.FieldCondition(key="document_id", match=qmodels.MatchValue(value=document_id))]
                    )
                    if document_id
                    else None
                )
                if hasattr(self.client, "query_points"):
                    response = self.client.query_points(
                        collection_name=self.collection_name,
                        query=query_vector,
                        query_filter=doc_filter,
                        limit=candidate_limit
                    )
                    results = response.points

            evidence = []
            for hit in results:
                payload = hit.payload or {}
                raw_vector_score = getattr(hit, "score", 0.0)
                vector_score = float(raw_vector_score) if raw_vector_score is not None else 0.0
                content = payload.get("content", "").strip()

                # Calculate lexical overlap between query and content
                lex_score = self._compute_lexical_overlap(query, content)

                # Combined hybrid score (vector semantic similarity + token lexical overlap)
                combined_score = (0.55 * vector_score) + (0.45 * lex_score)

                evidence.append({
                    "chunk_id": str(payload.get("chunk_id", hit.id)),
                    "raw_score": round(vector_score, 4),
                    "lexical_score": round(lex_score, 4),
                    "score": round(combined_score, 4),
                    "document_id": payload.get("document_id", "unknown"),
                    "filename": payload.get("filename", "unknown"),
                    "page_number": payload.get("page_number", 1),
                    "section": payload.get("section", "Paragraph"),
                    "chunk_index": payload.get("chunk_index", 0),
                    "content": content,
                    "metadata": payload
                })

            # Sort by combined hybrid score descending
            evidence.sort(key=lambda x: x["score"], reverse=True)
            return evidence[:top_k]

        except Exception as e:
            logger.error(f"Error querying Qdrant: {e}")
            return []

    def index_document_chunks(
        self,
        chunks: List[Dict[str, Any]],
        document_id: str,
        filename: str,
        user_id: str = "anonymous_user"
    ) -> int:
        """
        Indexes pre-split document chunks into Qdrant.
        Returns the confirmed count of indexed chunks.
        """
        if not self.client:
            self._init_client()
        if not self.client:
            logger.error("Qdrant client could not be initialized for indexing.")
            return 0

        points = []
        for idx, chunk in enumerate(chunks):
            content = chunk.get("content", "").strip()
            if not content:
                continue
            vector = self.get_embedding(content)
            point_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"{document_id}_{idx}"))

            points.append(
                qmodels.PointStruct(
                    id=point_id,
                    vector=vector,
                    payload={
                        "document_id": document_id,
                        "filename": filename,
                        "user_id": user_id,
                        "chunk_index": idx,
                        "chunk_id": f"{document_id[:8]}_chunk_{idx}",
                        "page_number": chunk.get("page_number", 1),
                        "section": chunk.get("section", "Paragraph"),
                        "content": content
                    }
                )
            )

        if not points:
            return 0

        try:
            self.client.upsert(collection_name=self.collection_name, points=points)
            logger.info(f"Successfully indexed {len(points)} chunks for document {filename} ({document_id})")
            return len(points)
        except Exception as e:
            logger.error(f"Failed to upsert chunks to Qdrant: {e}")
            return 0

    def delete_document_chunks(self, document_id: str) -> bool:
        """
        Deletes all chunks associated with a document_id from Qdrant.
        """
        if not self.client:
            return False
        try:
            self.client.delete(
                collection_name=self.collection_name,
                points_selector=qmodels.Filter(
                    must=[
                        qmodels.FieldCondition(
                            key="document_id",
                            match=qmodels.MatchValue(value=document_id)
                        )
                    ]
                )
            )
            return True
        except Exception as e:
            logger.error(f"Failed to delete chunks for document {document_id}: {e}")
            return False


rag_service = RAGService()
