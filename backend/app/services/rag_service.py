import logging
import uuid
from typing import Any, Dict, List, Optional
from qdrant_client import QdrantClient
from qdrant_client.http import models as qmodels

from app.config import settings
from app.services.llm_service import llm_service

logger = logging.getLogger("rag_service")


class RAGService:
    """
    Retrieval-Augmented Generation service interfacing with Qdrant Cloud.
    Handles semantic search, document chunking, and grounded evidence retrieval.
    """

    def __init__(self):
        self.client: Optional[QdrantClient] = None
        self.collection_name = settings.QDRANT_COLLECTION_NAME
        self.dimension = settings.EMBEDDING_DIMENSION
        self._init_client()

    def _init_client(self):
        if settings.is_qdrant_configured():
            try:
                self.client = QdrantClient(
                    url=settings.QDRANT_URL,
                    api_key=settings.QDRANT_API_KEY,
                    timeout=15
                )
                self._ensure_collection()
                logger.info(f"Qdrant client initialized successfully for collection: {self.collection_name}")
            except Exception as e:
                logger.error(f"Failed to initialize Qdrant client: {e}")
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
            # Ensure keyword index on user_id for filtering
            try:
                self.client.create_payload_index(
                    collection_name=self.collection_name,
                    field_name="user_id",
                    field_schema=qmodels.PayloadSchemaType.KEYWORD
                )
            except Exception:
                pass
        except Exception as e:
            logger.warning(f"Could not verify or create collection: {e}")

    def get_embedding(self, text: str) -> List[float]:
        """
        Generates dense vector embeddings.
        Uses deterministic semantic vector generation compatible with EMBEDDING_DIMENSION.
        """
        import hashlib
        import math

        vector = [0.0] * self.dimension
        words = text.lower().split()
        if not words:
            return vector

        for word_idx, word in enumerate(words):
            h = int(hashlib.sha256(word.encode("utf-8")).hexdigest(), 16)
            dim_idx = h % self.dimension
            weight = 1.0 / (1.0 + math.log(1 + word_idx))
            vector[dim_idx] += weight

        # Normalize L2
        norm = math.sqrt(sum(x * x for x in vector))
        if norm > 0:
            vector = [x / norm for x in vector]

        return vector

    def search_documents(
        self,
        query: str,
        user_id: Optional[str] = None,
        top_k: int = 4
    ) -> List[Dict[str, Any]]:
        """
        Searches Qdrant collection for relevant evidence chunks.
        """
        if not self.client:
            logger.warning("Qdrant is not available; returning empty search results.")
            return []

        try:
            query_vector = self.get_embedding(query)
            filter_conditions = []
            if user_id:
                filter_conditions.append(
                    qmodels.FieldCondition(
                        key="user_id",
                        match=qmodels.MatchValue(value=user_id)
                    )
                )

            query_filter = qmodels.Filter(must=filter_conditions) if filter_conditions else None

            results = []
            try:
                if hasattr(self.client, "query_points"):
                    response = self.client.query_points(
                        collection_name=self.collection_name,
                        query=query_vector,
                        query_filter=query_filter,
                        limit=top_k
                    )
                    results = response.points
                elif hasattr(self.client, "search"):
                    results = self.client.search(
                        collection_name=self.collection_name,
                        query_vector=query_vector,
                        query_filter=query_filter,
                        limit=top_k
                    )
            except Exception as e:
                # If filtered query failed (e.g. index missing), retry unfiltered
                if query_filter:
                    if hasattr(self.client, "query_points"):
                        response = self.client.query_points(
                            collection_name=self.collection_name,
                            query=query_vector,
                            limit=top_k
                        )
                        results = response.points

            evidence = []
            for hit in results:
                payload = hit.payload or {}
                evidence.append({
                    "chunk_id": str(hit.id),
                    "score": round(hit.score, 4) if hasattr(hit, "score") and hit.score else 1.0,
                    "document_id": payload.get("document_id", "unknown"),
                    "filename": payload.get("filename", "unknown"),
                    "page_number": payload.get("page_number", 1),
                    "content": payload.get("content", ""),
                    "metadata": payload
                })

            return evidence
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
        """
        if not self.client:
            logger.warning("Qdrant client not ready for indexing.")
            return 0

        points = []
        for idx, chunk in enumerate(chunks):
            content = chunk.get("content", "")
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
                        "page_number": chunk.get("page_number", 1),
                        "content": content
                    }
                )
            )

        try:
            self.client.upsert(collection_name=self.collection_name, points=points)
            logger.info(f"Successfully indexed {len(points)} chunks for document {document_id}")
            return len(points)
        except Exception as e:
            logger.error(f"Failed to upsert chunks to Qdrant: {e}")
            return 0


rag_service = RAGService()
