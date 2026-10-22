import logging
from typing import Literal
from langgraph.graph import END, StateGraph

from backend.app.agents.analyst import analyst_agent
from backend.app.agents.executor import executor_agent
from backend.app.agents.planner import planner_agent
from backend.app.agents.researcher import researcher_agent
from backend.app.agents.verifier import verifier_agent
from backend.app.graph.state import AgentState

logger = logging.getLogger("agent_workflow")


# Node wrapper functions
def planner_node(state: AgentState) -> AgentState:
    return planner_agent.run(state)


def researcher_node(state: AgentState) -> AgentState:
    return researcher_agent.run(state)


def analyst_node(state: AgentState) -> AgentState:
    return analyst_agent.run(state)


def executor_node(state: AgentState) -> AgentState:
    return executor_agent.run(state)


def verifier_node(state: AgentState) -> AgentState:
    return verifier_agent.run(state)


# Conditional routing functions
def after_planner_route(state: AgentState) -> Literal["researcher", "__end__"]:
    if state.agent_statuses.get("planner") == "completed" and state.subtasks:
        return "researcher"
    logger.warning("Planner failed or returned zero subtasks. Halting workflow safely.")
    state.overall_status = "failed"
    return "__end__"


def after_researcher_route(state: AgentState) -> Literal["analyst", "__end__"]:
    if state.agent_statuses.get("researcher") == "completed":
        return "analyst"
    logger.warning("Researcher stage failed. Halting workflow safely.")
    state.overall_status = "failed"
    return "__end__"


def after_analyst_route(state: AgentState) -> Literal["executor", "__end__"]:
    if state.agent_statuses.get("analyst") == "completed":
        return "executor"
    logger.warning("Analyst stage failed. Halting workflow safely.")
    state.overall_status = "failed"
    return "__end__"


def after_executor_route(state: AgentState) -> Literal["verifier", "__end__"]:
    if state.agent_statuses.get("executor") == "completed" and state.final_deliverable:
        return "verifier"
    logger.warning("Executor stage failed. Halting workflow safely.")
    state.overall_status = "failed"
    return "__end__"


def build_multi_agent_graph():
    """
    Constructs the compiled LangGraph multi-agent execution pipeline.
    """
    workflow = StateGraph(AgentState)

    # Add agent nodes
    workflow.add_node("planner", planner_node)
    workflow.add_node("researcher", researcher_node)
    workflow.add_node("analyst", analyst_node)
    workflow.add_node("executor", executor_node)
    workflow.add_node("verifier", verifier_node)

    # Set entry point
    workflow.set_entry_point("planner")

    # Connect conditional transitions
    workflow.add_conditional_edges(
        "planner",
        after_planner_route,
        {
            "researcher": "researcher",
            "__end__": END
        }
    )

    workflow.add_conditional_edges(
        "researcher",
        after_researcher_route,
        {
            "analyst": "analyst",
            "__end__": END
        }
    )

    workflow.add_conditional_edges(
        "analyst",
        after_analyst_route,
        {
            "executor": "executor",
            "__end__": END
        }
    )

    workflow.add_conditional_edges(
        "executor",
        after_executor_route,
        {
            "verifier": "verifier",
            "__end__": END
        }
    )

    workflow.add_edge("verifier", END)

    return workflow.compile()


# Compiled workflow instance
multi_agent_graph = build_multi_agent_graph()
