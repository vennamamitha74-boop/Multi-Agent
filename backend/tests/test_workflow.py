import sys
import time
from pathlib import Path
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from backend.app.main import app, TASK_STORE

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    print("Health check passed:", data)


def test_readiness():
    response = client.get("/ready")
    assert response.status_code == 200
    data = response.json()
    assert data["ready"] is True
    print("Readiness check passed:", data["components"])


def test_end_to_end_task_execution():
    task_payload = {
        "request": "Compare top 2 wireless noise-canceling headphones under $350 and give a final recommendation.",
        "user_id": "test_engineer"
    }

    # 1. Submit task
    response = client.post("/api/tasks", json=task_payload)
    assert response.status_code == 202
    task_id = response.json()["task_id"]
    print(f"\nTask submitted successfully. Task ID: {task_id}")

    # 2. Poll until workflow completes (up to 90 seconds for 5-agent execution)
    max_wait = 90
    start_time = time.time()
    completed = False

    while time.time() - start_time < max_wait:
        resp = client.get(f"/api/tasks/{task_id}")
        assert resp.status_code == 200
        task_data = resp.json()
        status = task_data.get("status")
        agent_statuses = task_data.get("agent_statuses", {})
        print(f"Status: {status} | Agent statuses: {agent_statuses}")

        if status in ("completed", "failed", "partially_completed"):
            completed = True
            break
        time.sleep(2)

    assert completed, "Task execution timed out"
    print("\n[Final Task Status]:", task_data.get("status"))
    print("[Planned Subtasks Count]:", len(task_data.get("subtasks", [])))
    print("[Agent Statuses]:", task_data.get("agent_statuses"))
    print("[Execution Events Count]:", len(task_data.get("events", [])))
    print("[Final Deliverable Preview]:\n", task_data.get("final_deliverable", "")[:350], "...")


if __name__ == "__main__":
    test_health()
    test_readiness()
    test_end_to_end_task_execution()
