import os
from fastapi.testclient import TestClient
from app.main import app
from app.services.rag_service import rag_service

def run_e2e_test():
    client = TestClient(app)
    fixture_path = os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        "fixtures",
        "Agentic_AI_Complete_12_Week_Roadmap.docx"
    )

    if not os.path.exists(fixture_path):
        raise FileNotFoundError(f"Fixture file not found at: {fixture_path}")

    with open(fixture_path, "rb") as f:
        doc_bytes = f.read()

    print("\n=================================================================")
    print("=== TEST STEP 1: Upload and Index Agentic AI 12-Week Roadmap ===")
    print("=================================================================")
    auth_user = "user_senior_engineer"
    upload_res = client.post(
        f"/api/documents/upload?user_id={auth_user}",
        files={
            "file": (
                "Agentic_AI_Complete_12_Week_Roadmap.docx",
                doc_bytes,
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            )
        }
    )

    print("Upload Status:", upload_res.status_code)
    upload_data = upload_res.json()
    assert upload_res.status_code == 200, f"Upload failed: {upload_res.text}"

    doc_id = upload_data.get("document_id")
    chunk_count = upload_data.get("chunk_count")
    print(f"Uploaded successfully! Document ID: {doc_id}")
    print(f"Verified Indexed Chunks: {chunk_count}")
    assert chunk_count > 100, f"Expected hundreds of chunks (around 700+), got {chunk_count}"

    print("\n=================================================================")
    print("=== TEST STEP 2: Verify Real Stored Qdrant Points & Metadata ===")
    print("=================================================================")
    verification = rag_service.verify_document_indexing(document_id=doc_id, expected_min_chunks=100)
    print("Verification Report:", verification)
    assert verification.get("verified") is True, f"Verification failed: {verification}"
    stored_points = verification.get("searchable_chunks", 0)
    print(f"Confirmed Searchable Points in Qdrant collection '{verification.get('collection')}': {stored_points}")
    assert stored_points == chunk_count

    # Check that sample chunk contains all required metadata
    sample_chunks = rag_service.get_document_chunks(document_id=doc_id, limit=3)
    assert len(sample_chunks) > 0
    sample = sample_chunks[0]
    print("\nSample Chunk Metadata:")
    for k in ["document_id", "user_id", "filename", "chunk_id", "page_number", "chunk_text", "upload_timestamp"]:
        assert k in sample, f"Missing required metadata key: {k}"
        print(f" - {k}: {str(sample[k])[:80]}")

    print("\n=================================================================")
    print("=== TEST STEP 3: Ask 'Tell me about this document.' ===")
    print("=================================================================")
    q1_payload = {
        "query": "Tell me about this document and summarize its main contents.",
        "document_id": doc_id,
        "user_id": auth_user
    }
    res1 = client.post("/api/documents/query", json=q1_payload)
    assert res1.status_code == 200
    data1 = res1.json()
    print("Intent:", data1.get("intent"))
    print("Is Grounded:", data1.get("is_grounded"))
    print("Evidence Count:", data1.get("evidence_count"))
    print("\nStructured Overview Output:\n", data1.get("answer"))
    print("\nVerified Citations:")
    for c in data1.get("citations", []):
        print(f" - [{c['citation_index']}] {c['filename']} ({c['chunk_id']}) Section: {c['section']}")
    assert data1.get("is_grounded") is True
    assert data1.get("intent") == "overview"
    assert len(data1.get("citations", [])) > 0
    assert "Document Purpose" in data1.get("answer") or "Purpose" in data1.get("answer")

    print("\n=================================================================")
    print("=== TEST STEP 4: Ask Question Whoser Answer is Explicitly Present ===")
    print("=================================================================")
    q2_payload = {
        "query": "How many weeks is the learning roadmap and how many hands-on projects are included?",
        "document_id": doc_id,
        "user_id": auth_user
    }
    res2 = client.post("/api/documents/query", json=q2_payload)
    assert res2.status_code == 200
    data2 = res2.json()
    print("Is Grounded:", data2.get("is_grounded"))
    print("Answer:\n", data2.get("answer"))
    print("\nVerified Citations:")
    for c in data2.get("citations", []):
        print(f" - [{c['citation_index']}] {c['filename']} ({c['chunk_id']}) Match: {c['similarity_score']}")
        print(f"   Excerpt: {c['snippet']}")
    assert data2.get("is_grounded") is True
    assert "12" in data2.get("answer")
    assert "6" in data2.get("answer") or "projects" in data2.get("answer").lower()
    assert len(data2.get("citations", [])) > 0

    print("\n=================================================================")
    print("=== TEST STEP 5: Ask 'What are the main topics?' ===")
    print("=================================================================")
    q3_payload = {
        "query": "What are the main topics covered across the curriculum?",
        "document_id": doc_id,
        "user_id": auth_user
    }
    res3 = client.post("/api/documents/query", json=q3_payload)
    assert res3.status_code == 200
    data3 = res3.json()
    print("Is Grounded:", data3.get("is_grounded"))
    print("Main Topics Answer:\n", data3.get("answer"))
    assert data3.get("is_grounded") is True
    assert len(data3.get("citations", [])) > 0

    print("\n=================================================================")
    print("=== TEST STEP 6: Ask 'Suggest improvements to this roadmap.' ===")
    print("=================================================================")
    q4_payload = {
        "query": "Suggest improvements to this roadmap and recommend innovative additions.",
        "document_id": doc_id,
        "user_id": auth_user
    }
    res4 = client.post("/api/documents/query", json=q4_payload)
    assert res4.status_code == 200
    data4 = res4.json()
    print("Intent:", data4.get("intent"))
    print("Is Grounded:", data4.get("is_grounded"))
    print("Ideas & Innovation Output:\n", data4.get("answer"))
    assert data4.get("is_grounded") is True
    assert data4.get("intent") == "ideas"
    assert len(data4.get("citations", [])) > 0

    print("\n=================================================================")
    print("=== TEST STEP 7: Ask Follow-up Question ===")
    print("=================================================================")
    q5_payload = {
        "query": "Explain the second recommendation in more detail and provide practical implementation steps.",
        "document_id": doc_id,
        "user_id": auth_user,
        "history": [
            {
                "question": "Suggest improvements to this roadmap and recommend innovative additions.",
                "answer": data4.get("answer")
            }
        ]
    }
    res5 = client.post("/api/documents/query", json=q5_payload)
    assert res5.status_code == 200
    data5 = res5.json()
    print("Intent:", data5.get("intent"))
    print("Is Grounded:", data5.get("is_grounded"))
    print("Follow-up Answer:\n", data5.get("answer"))
    assert data5.get("is_grounded") is True
    assert data5.get("intent") == "followup"

    print("\n=================================================================")
    print("=== TEST STEP 8: Test Document Isolation Between Users ===")
    print("=================================================================")
    unauthorized_user = "user_guest_intruder"
    q6_payload = {
        "query": "Tell me about this document.",
        "document_id": doc_id,
        "user_id": unauthorized_user
    }
    res6 = client.post("/api/documents/query", json=q6_payload)
    assert res6.status_code == 200
    data6 = res6.json()
    print("Unauthorized Access Query Result:", data6)
    assert data6.get("is_grounded") is False
    assert "Access denied" in data6.get("answer")
    assert len(data6.get("citations", [])) == 0
    print("PASSED: Unauthorized user was denied access to private document.")

    print("\n=================================================================")
    print("=== ALL 8 END-TO-END WORKFLOW TESTS PASSED WITH 100% SUCCESS ===")
    print("=================================================================\n")

if __name__ == "__main__":
    run_e2e_test()

