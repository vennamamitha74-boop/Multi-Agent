# Multi-Agent LLM Framework for Autonomous Task Planning & Execution

An autonomous, multi-agent LLM orchestration platform built with **FastAPI**, **LangGraph**, **Google Gemini**, **Qdrant Cloud RAG**, and **Next.js**.

---

## 🏛️ System Architecture

```text
User Request
     │
     ▼
[Planner Agent]        ──> Decomposes request into dependent subtasks & extracts constraints
     │
     ▼
[Researcher Agent]     ──> Retrieves evidence from Qdrant Cloud (RAG) & live external search
     │
     ▼
[Analyst Agent]        ──> Compares alternatives & validates constraints (budget, specs)
     │
     ▼
[Executor Agent]       ──> Synthesizes the comprehensive, evidence-grounded deliverable
     │
     ▼
[Verifier Agent]       ──> Audits against acceptance criteria & flags unsupported claims
     │
     ▼
Final Deliverable Report
```

---

## 🚀 Key Features

* **Resilient Gemini LLM Service:** Automatic fallback pool (`gemini-3.8-flash` $\to$ `gemini-3.5-flash` $\to$ `gemini-flash-latest`) with bounded exponential backoff on `429` quota limits and demand spikes.
* **LangGraph State Management:** Strict typed state tracking task progress, agent statuses, and execution timelines.
* **Qdrant Vector Database (RAG):** Document chunking and semantic vector search with source citation preservation.
* **Real External Search Integration:** Live external search queries without fabricating facts or hallucinating product specs.
* **FastAPI Backend:** RESTful endpoints for health, readiness, task queuing, polling, and document upload.
* **Modern Next.js Dashboard:** Dark mode glassmorphism interface with real-time agent coordination steppers, subtask trees, and Markdown reports.

---

## 🛠️ Project Structure

```text
├── backend/
│   ├── app/
│   │   ├── config.py           # Pydantic Settings loading .env
│   │   ├── main.py             # FastAPI app with CORS & task endpoints
│   │   ├── agents/             # Planner, Researcher, Analyst, Executor, Verifier
│   │   ├── graph/              # LangGraph state schema & conditional workflow
│   │   └── services/           # LLM, Qdrant RAG, Search, and Storage services
│   └── tests/                  # Verification and integration test suite
├── frontend/                   # Next.js 14 + Tailwind CSS dashboard
├── render.yaml                 # Render Blueprint deployment configuration
├── requirements.txt            # Python dependencies
├── .env.example                # Safe environment variable template
└── .gitignore                  # Protection for credentials and secrets
```

---

## 💻 Local Setup & Execution

### 1. Backend (FastAPI)
```bash
# Install dependencies
pip install -r requirements.txt

# Start backend server
uvicorn backend.app.main:app --reload --port 8000
```
Backend API will be running at `http://localhost:8000`.
* API Docs: `http://localhost:8000/docs`
* Health Check: `http://localhost:8000/health`
* Readiness Check: `http://localhost:8000/ready`

### 2. Frontend (Next.js)
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:3000` in your browser.

---

## 🧪 Running Automated Tests

```bash
# Test LLM Service & Fallbacks
python -u backend/tests/test_llm_service.py

# Test Complete 5-Agent End-to-End Pipeline
python -u backend/tests/test_workflow.py
```

---

## 🌐 Deployment (Render)

This repository includes a [`render.yaml`](render.yaml) blueprint:
1. Connect your repository to **Render.com**.
2. Deploy as a **Blueprint**.
3. Configure your environment secrets (`GEMINI_API_KEY`, `QDRANT_URL`, etc.) in the Render dashboard.
