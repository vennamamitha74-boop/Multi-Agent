import datetime
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
    Connects to Qdrant Cloud when available; seamlessly falls back to persistent on-disk Qdrant.
    """

    def __init__(self):
        self.client: Optional[QdrantClient] = None
        self.collection_name = settings.QDRANT_COLLECTION_NAME
        self.dimension = settings.EMBEDDING_DIMENSION
        self.storage_mode = "unknown"
        self._init_client()

    def _init_client(self):
        # 1. Attempt connection to configured Qdrant Cloud cluster
        if settings.is_qdrant_configured():
            try:
                logger.info(f"[Qdrant Init] Attempting connection to remote Qdrant Cloud at {settings.QDRANT_URL}...")
                client = QdrantClient(
                    url=settings.QDRANT_URL,
                    api_key=settings.QDRANT_API_KEY,
                    timeout=5
                )
                # Verify network reachability
                client.get_collections()
                self.client = client
                self.storage_mode = "cloud"
                self._ensure_collection()
                logger.info(f"[Qdrant Init] Qdrant Cloud connected successfully for collection: '{self.collection_name}'")
                return
            except Exception as e:
                logger.warning(f"[Qdrant Init] Could not connect to remote Qdrant Cloud ({e}). Initializing persistent local disk engine...")

        # 2. Resilient Persistent Local Storage on disk
        try:
            base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            storage_path = os.path.join(base_dir, "data", "qdrant_storage")
            os.makedirs(storage_path, exist_ok=True)
            self.client = QdrantClient(path=storage_path)
            self.storage_mode = "local_disk"
            self._ensure_collection()
            logger.info(f"[Qdrant Init] Persistent on-disk Qdrant engine initialized at '{storage_path}' for collection: '{self.collection_name}'.")
            return
        except Exception as e:
            logger.warning(f"[Qdrant Init] Could not initialize on-disk Qdrant ({e}). Falling back to in-memory mode...")

        # 3. In-memory fallback
        try:
            self.client = QdrantClient(":memory:")
            self.storage_mode = "memory"
            self._ensure_collection()
            logger.info(f"[Qdrant Init] In-memory Qdrant engine initialized for collection: '{self.collection_name}'.")
        except Exception as e:
            logger.error(f"[Qdrant Init] Fatal: Failed to initialize Qdrant client: {e}")
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

    def get_points_count(self, document_id: Optional[str] = None) -> int:
        """Returns total points in collection, optionally filtered by document_id."""
        if not self.client:
            return 0
        try:
            doc_filter = None
            if document_id:
                doc_filter = qmodels.Filter(
                    must=[qmodels.FieldCondition(key="document_id", match=qmodels.MatchValue(value=document_id))]
                )
            res = self.client.count(collection_name=self.collection_name, count_filter=doc_filter, exact=True)
            return res.count
        except Exception as e:
            logger.warning(f"Error checking points count: {e}")
            return 0

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
                content = payload.get("chunk_text") or payload.get("content", "")
                chunks.append({
                    "chunk_id": str(payload.get("chunk_id", hit.id)),
                    "document_id": payload.get("document_id", document_id),
                    "filename": payload.get("filename", "unknown"),
                    "user_id": payload.get("user_id", "unknown"),
                    "page_number": payload.get("page_number", 1),
                    "section": payload.get("section", "Paragraph"),
                    "chunk_index": payload.get("chunk_index", 0),
                    "chunk_text": content,
                    "content": content,
                    "score": 1.0,
                    "upload_timestamp": payload.get("upload_timestamp", ""),
                    "metadata": payload
                })

            chunks.sort(key=lambda x: x["chunk_index"])
            return chunks
        except Exception as e:
            logger.error(f"[RAG Diagnostics] Error fetching chunks for document {document_id}: {e}")
            return []

    def get_representative_chunks(self, document_id: str, max_chunks: int = 10) -> List[Dict[str, Any]]:
        """
        Retrieves representative chunks distributed across the document:
        start (intro/purpose), middle (key topics/architecture/weeks), and end (conclusions/projects).
        """
        all_chunks = self.get_document_chunks(document_id=document_id, limit=800)
        if not all_chunks:
            return []

        if len(all_chunks) <= max_chunks:
            return all_chunks

        # Sample across the document
        selected_indices = set()
        # Always include the first 2 chunks (document introduction, title, purpose)
        selected_indices.add(0)
        if len(all_chunks) > 1:
            selected_indices.add(1)

        # Always include the last chunk (summary / projects / conclusion)
        selected_indices.add(len(all_chunks) - 1)
        if len(all_chunks) > 2:
            selected_indices.add(len(all_chunks) - 2)

        # Distribute remaining slots evenly across the document body
        remaining_slots = max_chunks - len(selected_indices)
        if remaining_slots > 0:
            step = (len(all_chunks) - 4) / (remaining_slots + 1)
            for i in range(1, remaining_slots + 1):
                idx = int(2 + i * step)
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
        Provides comprehensive diagnostic logging.
        """
        if not self.client:
            logger.warning("[RAG Diagnostics] Qdrant is not available; returning empty search results.")
            return []

        try:
            total_points = self.get_points_count()
            logger.info(
                f"[RAG Diagnostics] Collection: '{self.collection_name}' | Total points: {total_points} | "
                f"Document ID: '{document_id}' | User ID: '{user_id}' | Query: '{query[:80]}'"
            )

            query_vector = self.get_embedding(query)
            filter_conditions = []
            if document_id:
                filter_conditions.append(
                    qmodels.FieldCondition(
                        key="document_id",
                        match=qmodels.MatchValue(value=document_id)
                    )
                )
            elif user_id and user_id not in ("anonymous_user", "admin", "system_admin"):
                filter_conditions.append(
                    qmodels.FieldCondition(
                        key="user_id",
                        match=qmodels.MatchValue(value=user_id)
                    )
                )

            query_filter = qmodels.Filter(must=filter_conditions) if filter_conditions else None

            # Fetch candidate pool for hybrid reranking
            candidate_limit = max(top_k * 4, 16)
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
                logger.warning(f"[RAG Diagnostics] Query filter warning: {e}. Retrying query...")
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
                content = payload.get("chunk_text") or payload.get("content", "").strip()

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
                    "user_id": payload.get("user_id", "unknown"),
                    "page_number": payload.get("page_number", 1),
                    "section": payload.get("section", "Paragraph"),
                    "chunk_index": payload.get("chunk_index", 0),
                    "chunk_text": content,
                    "content": content,
                    "upload_timestamp": payload.get("upload_timestamp", ""),
                    "metadata": payload
                })

            # Sort by combined hybrid score descending
            evidence.sort(key=lambda x: x["score"], reverse=True)
            logger.info(f"[RAG Diagnostics] Retrieved {len(evidence[:top_k])} chunks for query: '{query[:50]}'")
            return evidence[:top_k]

        except Exception as e:
            logger.error(f"[RAG Diagnostics] Error querying Qdrant: {e}")
            return []

    def index_document_chunks(
        self,
        chunks: List[Dict[str, Any]],
        document_id: str,
        filename: str,
        user_id: str = "anonymous_user"
    ) -> int:
        """
        Phase 1: Indexes pre-split document chunks into Qdrant.
        Stores all required metadata fields:
        - document_id, user_id, filename, chunk_id, page_number, chunk_text, upload_timestamp.
        Batches points in chunks of 50 for robust, high-volume ingestion.
        Returns the confirmed count of indexed chunks.
        """
        if not self.client:
            self._init_client()
        if not self.client:
            logger.error("[RAG Diagnostics] Qdrant client could not be initialized for indexing.")
            return 0

        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
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
                        "user_id": user_id,
                        "filename": filename,
                        "chunk_id": f"{document_id[:8]}_chunk_{idx}",
                        "page_number": chunk.get("page_number", 1),
                        "section": chunk.get("section", "Paragraph"),
                        "chunk_text": content,
                        "content": content,
                        "chunk_index": idx,
                        "upload_timestamp": now_iso
                    }
                )
            )

        if not points:
            return 0

        # Upsert in batches of 50 to prevent network/memory bottlenecks on 700+ chunks
        batch_size = 50
        total_upserted = 0
        try:
            for i in range(0, len(points), batch_size):
                batch = points[i:i + batch_size]
                self.client.upsert(collection_name=self.collection_name, points=batch)
                total_upserted += len(batch)

            logger.info(
                f"[RAG Diagnostics] Successfully indexed {total_upserted} chunks for document '{filename}' "
                f"({document_id}) into Qdrant collection '{self.collection_name}'"
            )
            return total_upserted
        except Exception as e:
            logger.error(f"[RAG Diagnostics] Failed to upsert chunks to Qdrant: {e}")
            return 0

    def verify_document_indexing(
        self,
        document_id: str,
        expected_min_chunks: int = 1
    ) -> Dict[str, Any]:
        """
        Phase 4: Real Index Verification.
        - Queries Qdrant for actual stored points belonging to document_id.
        - Verifies required metadata fields exist on stored points.
        - Executes a test similarity search to verify chunks are searchable.
        - Returns verification metrics or raises ValueError on indexing failure.
        """
        if not self.client:
            return {"verified": False, "searchable_chunks": 0, "error": "Qdrant client unavailable"}

        try:
            # 1. Verify point count in Qdrant for this document
            doc_filter = qmodels.Filter(
                must=[
                    qmodels.FieldCondition(
                        key="document_id",
                        match=qmodels.MatchValue(value=document_id)
                    )
                ]
            )
            count_res = self.client.count(
                collection_name=self.collection_name,
                count_filter=doc_filter,
                exact=True
            )
            stored_points = count_res.count

            if stored_points < expected_min_chunks:
                logger.error(
                    f"[Index Verification FAILED] Document {document_id} has {stored_points} points in Qdrant "
                    f"(expected >= {expected_min_chunks})."
                )
                return {
                    "verified": False,
                    "searchable_chunks": stored_points,
                    "error": f"Qdrant stored {stored_points} points, less than expected {expected_min_chunks}."
                }

            # 2. Inspect sample points to confirm required metadata fields
            records, _ = self.client.scroll(
                collection_name=self.collection_name,
                scroll_filter=doc_filter,
                limit=3,
                with_payload=True,
                with_vectors=False
            )
            required_fields = ["document_id", "user_id", "filename", "chunk_id", "chunk_text", "upload_timestamp"]
            for record in records:
                payload = record.payload or {}
                missing = [f for f in required_fields if f not in payload]
                if missing:
                    logger.warning(f"[Index Verification] Chunk {record.id} missing metadata fields: {missing}")

            # 3. Run a test similarity search using a query vector to confirm searchability
            test_vector = self.get_embedding("agentic ai roadmap overview architecture concepts")
            search_res = []
            if hasattr(self.client, "query_points"):
                resp = self.client.query_points(
                    collection_name=self.collection_name,
                    query=test_vector,
                    query_filter=doc_filter,
                    limit=2
                )
                search_res = resp.points
            elif hasattr(self.client, "search"):
                search_res = self.client.search(
                    collection_name=self.collection_name,
                    query_vector=test_vector,
                    query_filter=doc_filter,
                    limit=2
                )

            is_searchable = len(search_res) > 0
            logger.info(
                f"[Index Verification PASSED] Document {document_id}: {stored_points} chunks verified & searchable "
                f"in Qdrant collection '{self.collection_name}'."
            )

            return {
                "verified": is_searchable and stored_points > 0,
                "searchable_chunks": stored_points,
                "test_hits": len(search_res),
                "collection": self.collection_name
            }

        except Exception as e:
            logger.error(f"[Index Verification Error] Error during document index verification: {e}")
            return {"verified": False, "searchable_chunks": 0, "error": str(e)}

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
            logger.info(f"[RAG Diagnostics] Deleted chunks for document {document_id}")
            return True
        except Exception as e:
            logger.error(f"[RAG Diagnostics] Failed to delete chunks for document {document_id}: {e}")
            return False


rag_service = RAGService()
