import io
import json
import os
import sys
import unittest
import urllib.request
import urllib.error

BASE_URL = "http://127.0.0.1:8000"

class TestFirebaseOwnershipAndRAG(unittest.TestCase):
    user_a = "user_alpha_tester"
    user_b = "user_beta_tester"
    token_a = f"dev-token-{user_a}"
    token_b = f"dev-token-{user_b}"

    @classmethod
    def setUpClass(cls):
        # Verify server is up
        req = urllib.request.Request(f"{BASE_URL}/health")
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode())
            assert data.get("status") == "healthy"

    def test_01_existing_document_access(self):
        """Tests the existing indexed document: User Senior Engineer owns it, User Beta cannot access it."""
        doc_id = "0e9062aa-e535-408e-baf6-db0de7457e29"

        # 1. User Senior Engineer (Owner) lists documents
        req = urllib.request.Request(
            f"{BASE_URL}/api/documents",
            headers={"Authorization": "Bearer dev-token-user_senior_engineer", "X-User-Id": "user_senior_engineer"}
        )
        with urllib.request.urlopen(req) as resp:
            docs = json.loads(resp.read().decode())
            owner_doc_ids = [d["document_id"] for d in docs]
            self.assertIn(doc_id, owner_doc_ids, "Owner should see their own document in the listing")

        # 2. User Senior Engineer queries their own document
        query_payload = json.dumps({
            "query": "Tell me about this document and summarize its main contents",
            "document_id": doc_id,
            "top_k": 6,
            "history": []
        }).encode("utf-8")
        req = urllib.request.Request(
            f"{BASE_URL}/api/documents/query",
            data=query_payload,
            headers={
                "Content-Type": "application/json",
                "Authorization": "Bearer dev-token-user_senior_engineer",
                "X-User-Id": "user_senior_engineer"
            }
        )
        with urllib.request.urlopen(req) as resp:
            res = json.loads(resp.read().decode())
            self.assertTrue(res.get("is_grounded"), "Query by owner must be grounded")
            self.assertGreater(len(res.get("citations", [])), 0, "Query by owner must retrieve genuine citations")
            self.assertIn("Roadmap", res.get("answer", "") + str(res.get("citations", [])))

        # 3. User Beta (Unauthorized) tries to query the existing document -> Must be 403 Forbidden
        req_unauth = urllib.request.Request(
            f"{BASE_URL}/api/documents/query",
            data=query_payload,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.token_b}",
                "X-User-Id": self.user_b
            }
        )
        try:
            with urllib.request.urlopen(req_unauth) as resp:
                self.fail("User Beta should have been denied access with HTTP 403")
        except urllib.error.HTTPError as e:
            self.assertEqual(e.code, 403, f"Expected HTTP 403 Forbidden, got {e.code}")
            err_body = json.loads(e.read().decode())
            self.assertIn("Access denied", err_body.get("detail", ""))

    def test_02_user_a_upload_and_query_flow(self):
        """
        Step 1: Upload a new document as User A.
        Step 2: Query it as User A -> returns grounded answer and citations.
        Step 3: Refresh/re-query it as User A.
        Step 4: Log in as User B -> document not in User B's list.
        Step 5: User B attempts query -> HTTP 403 Forbidden.
        Step 6: User B uploads their own document and queries it -> 200 OK.
        """
        # Step 1: Upload document as User A
        boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW"
        file_content = (
            "Architectural Benchmark Report for Vector Search Engines.\n\n"
            "This enterprise report analyzes Qdrant vector retrieval performance. "
            "Qdrant achieves 1.2ms p99 query latency with 10 million vector points under HNSW indexing. "
            "Memory utilization is measured at 4.2GB RAM with scalar quantization enabled. "
            "Strict tenant isolation guarantees zero cross-organization vector leakage."
        )
        body = (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="file"; filename="benchmark_report_alpha.txt"\r\n'
            f"Content-Type: text/plain\r\n\r\n"
            f"{file_content}\r\n"
            f"--{boundary}--\r\n"
        ).encode("utf-8")

        req = urllib.request.Request(
            f"{BASE_URL}/api/documents/upload",
            data=body,
            headers={
                "Content-Type": f"multipart/form-data; boundary={boundary}",
                "Authorization": f"Bearer {self.token_a}",
                "X-User-Id": self.user_a
            }
        )
        with urllib.request.urlopen(req) as resp:
            doc_a = json.loads(resp.read().decode())
            doc_a_id = doc_a["document_id"]
            self.assertEqual(doc_a["owner_uid"], self.user_a)
            self.assertGreater(doc_a["chunk_count"], 0)

        # Step 2: Query it as User A
        query_payload = json.dumps({
            "query": "What is the p99 query latency and memory consumption of Qdrant?",
            "document_id": doc_a_id,
            "top_k": 3,
            "history": []
        }).encode("utf-8")

        req = urllib.request.Request(
            f"{BASE_URL}/api/documents/query",
            data=query_payload,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.token_a}",
                "X-User-Id": self.user_a
            }
        )
        with urllib.request.urlopen(req) as resp:
            res_a = json.loads(resp.read().decode())
            self.assertTrue(res_a.get("is_grounded"), "User A query must be grounded")
            self.assertGreater(len(res_a.get("citations", [])), 0, "User A query must have genuine citations")
            self.assertIn("1.2ms", res_a.get("answer", "") + str(res_a.get("citations", [])))

        # Step 3: Refresh and query again as User A
        req_refreshed = urllib.request.Request(
            f"{BASE_URL}/api/documents/query",
            data=query_payload,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.token_a}",
                "X-User-Id": self.user_a
            }
        )
        with urllib.request.urlopen(req_refreshed) as resp:
            res_a2 = json.loads(resp.read().decode())
            self.assertTrue(res_a2.get("is_grounded"))
            self.assertGreater(len(res_a2.get("citations", [])), 0)

        # Step 4: User B listing does NOT include User A's document
        req_b_list = urllib.request.Request(
            f"{BASE_URL}/api/documents",
            headers={"Authorization": f"Bearer {self.token_b}", "X-User-Id": self.user_b}
        )
        with urllib.request.urlopen(req_b_list) as resp:
            docs_b = json.loads(resp.read().decode())
            docs_b_ids = [d["document_id"] for d in docs_b]
            self.assertNotIn(doc_a_id, docs_b_ids, "User B must not see User A's document in listing")

        # Step 5: Confirm User B cannot access User A's document
        req_b_query = urllib.request.Request(
            f"{BASE_URL}/api/documents/query",
            data=query_payload,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.token_b}",
                "X-User-Id": self.user_b
            }
        )
        try:
            with urllib.request.urlopen(req_b_query) as resp:
                self.fail("User B must receive HTTP 403 Forbidden when accessing User A document")
        except urllib.error.HTTPError as e:
            self.assertEqual(e.code, 403)
            err_data = json.loads(e.read().decode())
            self.assertIn("Access denied", err_data.get("detail", ""))

        # Step 6: User B uploads and queries their own separate document
        file_b_content = (
            "Cybersecurity Governance and Incident Response Playbook.\n\n"
            "This document establishes the Zero Trust framework for enterprise workloads. "
            "MFA is mandatory for all access with 15-minute token expiry. "
            "Automated SIEM intrusion response triggers within 30 seconds of an anomaly."
        )
        body_b = (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="file"; filename="security_playbook_beta.txt"\r\n'
            f"Content-Type: text/plain\r\n\r\n"
            f"{file_b_content}\r\n"
            f"--{boundary}--\r\n"
        ).encode("utf-8")

        req_upload_b = urllib.request.Request(
            f"{BASE_URL}/api/documents/upload",
            data=body_b,
            headers={
                "Content-Type": f"multipart/form-data; boundary={boundary}",
                "Authorization": f"Bearer {self.token_b}",
                "X-User-Id": self.user_b
            }
        )
        with urllib.request.urlopen(req_upload_b) as resp:
            doc_b = json.loads(resp.read().decode())
            doc_b_id = doc_b["document_id"]
            self.assertEqual(doc_b["owner_uid"], self.user_b)

        # Query User B's document as User B
        query_b_payload = json.dumps({
            "query": "What is the token expiry and SIEM intrusion response time?",
            "document_id": doc_b_id,
            "top_k": 3,
            "history": []
        }).encode("utf-8")

        req_query_b = urllib.request.Request(
            f"{BASE_URL}/api/documents/query",
            data=query_b_payload,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.token_b}",
                "X-User-Id": self.user_b
            }
        )
        with urllib.request.urlopen(req_query_b) as resp:
            res_b = json.loads(resp.read().decode())
            self.assertTrue(res_b.get("is_grounded"))
            self.assertGreater(len(res_b.get("citations", [])), 0)
            self.assertIn("30 seconds", res_b.get("answer", "") + str(res_b.get("citations", [])))

        # Clean up test documents
        for doc_id, token, uid in [(doc_a_id, self.token_a, self.user_a), (doc_b_id, self.token_b, self.user_b)]:
            del_req = urllib.request.Request(
                f"{BASE_URL}/api/documents/{doc_id}",
                headers={"Authorization": f"Bearer {token}", "X-User-Id": uid}
            )
            del_req.get_method = lambda: "DELETE"
            try:
                urllib.request.urlopen(del_req)
            except Exception:
                pass

if __name__ == "__main__":
    unittest.main()

