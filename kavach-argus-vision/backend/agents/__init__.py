"""
KAVACH Agents Package
"""
from .supervisor import supervisor_node, set_push_thought as set_supervisor_thought
from .threat_agent import threat_node, set_push_thought as set_threat_thought
from .family_alert_agent import family_alert_node, set_push_thought as set_family_thought
from .fir_agent import fir_node, set_push_thought as set_fir_thought
from .navigation_agent import navigation_node, set_push_thought as set_navigation_thought
from .argus_agent import argus_node, set_push_thought as set_argus_thought
from .ncrb_agent import ncrb_node, set_push_thought as set_ncrb_thought


def wire_push_thought(fn):
    """Wire a single push_thought function to all agents."""
    set_supervisor_thought(fn)
    set_threat_thought(fn)
    set_family_thought(fn)
    set_fir_thought(fn)
    set_navigation_thought(fn)
    set_argus_thought(fn)
    set_ncrb_thought(fn)
