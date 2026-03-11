"""SSE event type constants.

Centralises all event names so producers (council.py, sessions.py) and
consumers (frontend SSE service) stay in sync.
"""
from __future__ import annotations

# -- Stage / Setup --
STAGE_SET: str = "stage_set"
STAGE_SET_INTRO: str = "stage_set_intro"

# -- Deliberation --
AGENT_TYPING: str = "agent_typing"
AGENT_MESSAGE: str = "agent_message"
TOOL_USE: str = "tool_use"
ROUND_COMPLETE: str = "round_complete"
AWAITING_HUMAN_TURN: str = "awaiting_human_turn"
SUMMARY_READY: str = "summary_ready"

# -- Closing Statements (research questions) --
CLOSING_STATEMENT: str = "closing_statement"

# -- Candidate Proposals (open-ended questions) --
CANDIDATE_PROPOSED: str = "candidate_proposed"
CANDIDATES_FINALIZED: str = "candidates_finalized"
MODERATOR_ACTION: str = "moderator_action"

# -- Voting --
VOTING_STARTED: str = "voting_started"
VOTING_CAST: str = "voting_cast"
AWAITING_HUMAN_VOTE: str = "awaiting_human_vote"

# -- Outcome --
VERDICT: str = "verdict"

# -- Errors / Limits --
RATE_LIMITED: str = "rate_limited"
ERROR: str = "error"
