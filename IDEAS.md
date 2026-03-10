# IDEAS — Agent Council

> A scratchpad for ideas that come up during development.
> Claude writes here when something interesting comes to mind while working.
> Not bugs, not TODOs — just possibilities worth considering.

---

## Engine & Architecture

- **Parallel agent mode** — Allow agents within a round to respond concurrently instead of sequentially, then share all responses at once. Would dramatically speed up rounds with many agents, and creates a different debate dynamic (no anchoring to the first speaker).

- **Agent persona library** — A `personas/` directory of reusable system prompt templates (e.g., "Devil's Advocate", "Domain Expert", "Mediator"). Councils could compose agents from these instead of writing prompts from scratch every time.

- **Agent memory across sessions** — Let agents optionally retain key takeaways from past sessions. A "Synthesizer" agent that remembers previous debates on related topics could produce much richer reasoning.

## UX & Frontend

- **Confidence-over-time visualization** — Each round already produces agent responses; if we track confidence per round, we could show a line chart of how the council's certainty evolves during deliberation. Makes the debate feel alive.

- **Devil's advocate highlight** — Visually distinguish dissenting opinions in the debate UI (e.g., red border on messages that oppose the current majority). Makes it easy to spot where the interesting tension is.

## Wrappers & Use Cases

- **Code review council** — A wrapper where agents review a PR diff: one checks correctness, one checks style, one checks security, one plays devil's advocate defending the author's choices. Output: structured review comments.

- **Interview prep council** — Agents simulate a panel interview. User submits an answer, agents critique it from different angles (technical depth, communication clarity, completeness).

---
