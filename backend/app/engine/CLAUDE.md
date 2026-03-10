# Engine — Deliberation Core

The `engine/` package contains the core deliberation logic that orchestrates multi-agent debate sessions.

## Modules

### `agent.py` — LLM Client

Thin wrapper around the Anthropic Claude API.

- **`call_agent(agent, messages, system_prompt) -> str`** — Sends a message list to Claude and returns the complete response text. Uses a module-level singleton `AsyncAnthropic` client.
- No token-level streaming — returns the full response at once.
- Model is read from the `Agent` ORM object (defaults to `claude-sonnet-4-20250514`).

### `voting.py` — Vote Tallying

Implements four voting mechanisms, each receiving a list of `Vote` ORM objects:

| Mechanism | Function | Behaviour |
|-----------|----------|-----------|
| `majority` | `_majority()` | Simple count, most common value wins |
| `weighted` | `_weighted()` | Sum confidence per value, highest weighted value wins |
| `consensus` | `_consensus()` | All agents must agree; returns `no_consensus` otherwise |
| `human_in_loop` | — | Raises `HumanVoteRequired` immediately |

- **`tally_votes(votes, mechanism)`** — Router that dispatches to the correct mechanism.
- **`HumanVoteRequired`** — Exception raised for `human_in_loop`; caught by the council orchestrator to pause the session.
- All functions return `{"decision": str, "confidence": float, "summary": str}`.
- **Confidence as weight**: In weighted voting, agent-reported confidence directly scales vote weight.
- **Consensus requires unanimity**: All agents must agree; no threshold — it's all-or-nothing.

### `council.py` — Session Orchestrator

The main engine entry point. `run_council_session()` is an **async generator** that yields SSE-formatted strings.

#### Flow

1. **Load** — Fetches `Session` with `Council` + `Agent` list via `selectinload`
2. **Running** — Sets session status to `"running"`
3. **Rounds** — For each round (1..N):
   - Creates a `Round` DB row
   - For each agent (sequential — each sees all prior responses):
     - Builds Claude-compatible messages via `_build_agent_messages()`
     - Calls `call_agent()`, saves `Message` row
     - Yields `agent_message` SSE event
   - Yields `round_complete` SSE event
4. **Voting** — Sets status to `"voting"`:
   - Builds a voting prompt, calls each agent, parses JSON vote
   - Saves `Vote` rows, yields `voting_cast` SSE per vote
   - Calls `tally_votes()` to determine outcome
5. **Verdict** — Saves `Verdict`, sets status to `"complete"`, yields `verdict` SSE
6. **Error** — On exception: rolls back, sets status to `"error"`, yields error SSE

#### Helpers

- **`_build_agent_messages(history, current_agent, input_claim)`** — Converts flat debate history to Claude API format. Own messages become `"assistant"` role; others become `"user"` role with `[AgentName]:` prefix. Consecutive same-role messages are merged to satisfy the API's alternation constraint. Appends a continuation nudge if the last message is `"assistant"`.

- **`_build_voting_prompt(input_claim, history)`** — Formats the full debate transcript and asks the agent to respond with a JSON vote: `{"value", "confidence", "reasoning"}`.

- **`_parse_vote(raw_text)`** — Extracts JSON from agent response by finding the outermost `{…}`. Falls back to `{"value": "abstain", "confidence": 0.0, "reasoning": <raw_text>}`.

## SSE Event Types

| Event | Data fields | When |
|-------|-------------|------|
| `agent_message` | `agent_id`, `agent_name`, `round`, `content` | After each agent responds |
| `round_complete` | `round` | After all agents in a round |
| `voting_cast` | `agent_id`, `agent_name`, `vote`, `confidence`, `reasoning` | After each agent votes |
| `verdict` | `decision`, `confidence`, `summary` | Final result |
| `awaiting_human_vote` | `message` | When `human_in_loop` mechanism is used |
| `error` | `message` | On engine failure |

## Key Design Decisions

- **Lazy client singleton**: `agent.py` creates the Anthropic client on first use (not at import time).
- **Sequential agent calls within a round**: Each agent sees all prior responses before replying, enabling genuine back-and-forth debate.
- **No token streaming**: SSE fires once per completed agent response (not per token), keeping the protocol simple.
- **Dedicated DB session**: The SSE stream endpoint creates its own `AsyncSession` via `async_session_factory()` because the request-scoped session closes when the endpoint handler returns, but `StreamingResponse` keeps the generator alive after that.
- **Vote parsing resilience**: JSON extraction uses `find`/`rfind` to handle LLMs that wrap JSON in markdown or preamble. Falls back to `abstain` on unparseable responses.
