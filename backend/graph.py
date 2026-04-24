"""
KAVACH LangGraph — 6-Node Parallel Agent Pipeline
Supervisor → [threat, family_alert, fir, navigation, argus, ncrb] → END
"""
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

from state import KavachState
from agents import (
    supervisor_node,
    threat_node,
    family_alert_node,
    fir_node,
    navigation_node,
    argus_node,
    ncrb_node,
)


def build_graph():
    """Build and compile the KAVACH 6-agent LangGraph pipeline.

    Flow:
        supervisor (entry) ──→ threat      ──→ END
                            ├─→ family_alert ──→ END
                            ├─→ fir          ──→ END
                            ├─→ navigation   ──→ END
                            ├─→ argus        ──→ END
                            └─→ ncrb         ──→ END

    Notes:
        - All 6 agents run in parallel after supervisor.
        - ncrb is pure Python so it finishes before LLM-based agents.
        - threat_agent checks ncrb_hotspot_match which may already be
          populated since ncrb always beats a network LLM call.
    """
    builder = StateGraph(KavachState)

    # ── Add nodes ──────────────────────────────────────────
    builder.add_node("supervisor", supervisor_node)
    builder.add_node("threat", threat_node)
    builder.add_node("family_alert", family_alert_node)
    builder.add_node("fir", fir_node)
    builder.add_node("navigation", navigation_node)
    builder.add_node("argus", argus_node)
    builder.add_node("ncrb", ncrb_node)

    # ── Entry point ────────────────────────────────────────
    builder.set_entry_point("supervisor")

    # ── Fan-out: supervisor fires ALL 6 in parallel ────────
    for agent in ["threat", "family_alert", "fir", "navigation", "argus", "ncrb"]:
        builder.add_edge("supervisor", agent)
        builder.add_edge(agent, END)

    # ── Compile with in-memory checkpointer ────────────────
    return builder.compile(checkpointer=MemorySaver())
