import io
import docx
from fastapi.testclient import TestClient
from app.main import app

def run_test():
    client = TestClient(app)

    print("=================================================================")
    print("=== STEP 1: Creating real DOCX document with paragraphs & tables ===")
    print("=================================================================")
    doc = docx.Document()
    doc.add_heading("Enterprise Cloud Architecture Benchmarks", 0)
    doc.add_paragraph("This document outlines the Q4 performance metrics and infrastructure SLAs for the multi-agent orchestration platform.")
    doc.add_paragraph("The primary purpose of this architecture is to provide high-throughput, low-latency reasoning and vector retrieval across distributed clusters.")
    doc.add_paragraph("The average latency for vector search on Qdrant was benchmarked at 12 milliseconds across 10 million embeddings with 99.9% uptime.")
    doc.add_paragraph("Gemini LLM inference exhibits an average response latency of 240 milliseconds under standard load conditions.")
    doc.add_paragraph("In conclusion, the system meets all Q4 performance SLAs but requires horizontal auto-scaling and Redis caching to prevent peak-hour spikes.")

    table = doc.add_table(rows=3, cols=2)
    table.cell(0, 0).text = "Component"
    table.cell(0, 1).text = "Latency SLA"
    table.cell(1, 0).text = "Qdrant Vector DB"
    table.cell(1, 1).text = "12ms"
    table.cell(2, 0).text = "Gemini LLM Inference"
    table.cell(2, 1).text = "240ms"

    doc_bytes = io.BytesIO()
    doc.save(doc_bytes)
    doc_bytes.seek(0)

    print("Ingesting DOCX via /api/documents/upload...")
    response = client.post(
        "/api/documents/upload",
        files={
            "file": (
                "enterprise_architecture_benchmarks.docx",
                doc_bytes.getvalue(),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            )
        }
    )

    assert response.status_code == 200, f"Upload failed: {response.text}"
    upload_data = response.json()
    doc_id = upload_data.get("document_id")
    chunk_count = upload_data.get("chunk_count")
    print(f"Uploaded successfully! Document ID: {doc_id}, Verified chunks indexed: {chunk_count}")
    assert chunk_count > 0, "Chunk count must be greater than 0!"

    # =========================================================================
    # TEST 1: Ask for Document Summary / Overview
    # =========================================================================
    print("\n=================================================================")
    print("=== TEST 1: Document Overview / Summarization ===")
    print("=================================================================")
    summary_payload = {
        "query": "Tell me about this document and summarize its main contents.",
        "document_id": doc_id,
        "user_id": "architect_lead"
    }
    res1 = client.post("/api/documents/query", json=summary_payload)
    data1 = res1.json()
    print("Intent:", data1.get("intent"))
    print("Is Grounded:", data1.get("is_grounded"))
    print("Evidence Count:", data1.get("evidence_count"))
    print("Structured Overview Answer:\n", data1.get("answer"))
    print("\nVerified Citations for Summary:")
    for cit in data1.get("citations", []):
        print(f" - [{cit['citation_index']}] {cit['filename']} ({cit['chunk_id']}) Score: {cit['similarity_score']}")
    assert data1.get("is_grounded") is True
    assert data1.get("intent") == "overview"
    assert len(data1.get("citations", [])) > 0
    assert "Document Purpose" in data1.get("answer") or "Purpose" in data1.get("answer")

    # =========================================================================
    # TEST 2: Specific Question Answering
    # =========================================================================
    print("\n=================================================================")
    print("=== TEST 2: Specific Question Answering ===")
    print("=================================================================")
    specific_payload = {
        "query": "What is the benchmarked latency for vector search on Qdrant?",
        "document_id": doc_id,
        "user_id": "architect_lead"
    }
    res2 = client.post("/api/documents/query", json=specific_payload)
    data2 = res2.json()
    print("Intent:", data2.get("intent"))
    print("Is Grounded:", data2.get("is_grounded"))
    print("Answer:\n", data2.get("answer"))
    print("\nVerified Citations:")
    for cit in data2.get("citations", []):
        print(f" - [{cit['citation_index']}] {cit['filename']} ({cit['chunk_id']}) Section: {cit['section']} Score: {cit['similarity_score']}")
        print(f"   Snippet: {cit['snippet']}")
    assert data2.get("is_grounded") is True
    assert "12" in data2.get("answer")
    assert len(data2.get("citations", [])) > 0

    # =========================================================================
    # TEST 3: Unrelated Question Out of Context
    # =========================================================================
    print("\n=================================================================")
    print("=== TEST 3: Unrelated Question Out of Context ===")
    print("=================================================================")
    unrelated_payload = {
        "query": "What are the ingredients and instructions for baking chocolate cookies?",
        "document_id": doc_id,
        "user_id": "architect_lead"
    }
    res3 = client.post("/api/documents/query", json=unrelated_payload)
    data3 = res3.json()
    print("Is Grounded:", data3.get("is_grounded"))
    print("Citations count:", len(data3.get("citations", [])))
    print("Answer:\n", data3.get("answer"))
    assert data3.get("is_grounded") is False
    assert len(data3.get("citations", [])) == 0
    assert "does not contain sufficient information" in data3.get("answer").lower()

    # =========================================================================
    # TEST 4: Ideas and Innovation
    # =========================================================================
    print("\n=================================================================")
    print("=== TEST 4: Ideas and Innovation Suggestions ===")
    print("=================================================================")
    ideas_payload = {
        "query": "What improvement ideas and innovations do you suggest for this architecture?",
        "document_id": doc_id,
        "user_id": "architect_lead"
    }
    res4 = client.post("/api/documents/query", json=ideas_payload)
    data4 = res4.json()
    print("Intent:", data4.get("intent"))
    print("Is Grounded:", data4.get("is_grounded"))
    print("Ideas & Innovation Output:\n", data4.get("answer"))
    print("\nVerified Citations for Baseline:")
    for cit in data4.get("citations", []):
        print(f" - [{cit['citation_index']}] {cit['filename']} ({cit['chunk_id']})")
    assert data4.get("is_grounded") is True
    assert data4.get("intent") == "ideas"
    assert len(data4.get("citations", [])) > 0

    # =========================================================================
    # TEST 5: Conversation Context Follow-Up Question
    # =========================================================================
    print("\n=================================================================")
    print("=== TEST 5: Conversation Context Follow-Up ===")
    print("=================================================================")
    followup_payload = {
        "query": "Explain the second recommendation in more detail and provide concrete implementation examples.",
        "document_id": doc_id,
        "user_id": "architect_lead",
        "history": [
            {
                "question": "What improvement ideas and innovations do you suggest for this architecture?",
                "answer": data4.get("answer")
            }
        ]
    }
    res5 = client.post("/api/documents/query", json=followup_payload)
    data5 = res5.json()
    print("Intent:", data5.get("intent"))
    print("Is Grounded:", data5.get("is_grounded"))
    print("Follow-up Answer:\n", data5.get("answer"))
    assert data5.get("is_grounded") is True
    assert data5.get("intent") == "followup"

    print("\n=================================================================")
    print("=== ALL 5 RAG PIPELINE TESTS PASSED WITH 100% SUCCESS ===")
    print("=================================================================")

if __name__ == "__main__":
    run_test()
