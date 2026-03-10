# Engine — CLAUDE.md

## Purpose
Core deliberation logic — agent LLM calls, round orchestration, and voting.

## Key Design Choices
- **Lazy client singleton**: `agent.py` creates the Anthropic client on first use (not at import time)
- **Full response, not streaming**: `call_agent()` returns the complete text, not a token stream
- **Pluggable voting**: `tally_votes()` dispatches to `_majority`, `_weighted`, `_consensus`, or raises `HumanVoteRequired`
- **Confidence as weight**: In weighted voting, agent-reported confidence directly scales vote weight
- **Consensus requires unanimity**: All agents must agree; no threshold — it's all-or-nothing

## Files
- `agent.py` — Claude API wrapper; single async function `call_agent(agent, messages, system_prompt)`
- `council.py` — Round orchestration (currently a stub — `NotImplementedError`)
- `voting.py` — Four voting mechanisms + `HumanVoteRequired` exception for human-in-loop
