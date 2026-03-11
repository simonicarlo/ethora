# Stream A — System Prompt Extraction & Enhancement

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract hardcoded prompts from `council.py` into editable template files and add deliberation framing that wraps each agent's system prompt with council context.

**Architecture:** New `backend/app/engine/prompts/` package with `.txt` template files and a `loader.py` module. Templates use `{variable}` placeholders interpolated via `str.replace()` chains (safe for user content containing braces). `council.py` calls loader functions instead of building prompts inline.

**Tech Stack:** Python, str.replace(), pathlib for file loading

**Spec:** `docs/superpowers/specs/2026-03-11-stream-a-prompt-extraction-design.md`

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `backend/app/engine/prompts/__init__.py` | Package marker (empty) |
| Create | `backend/app/engine/prompts/loader.py` | Template loading, caching, render functions |
| Create | `backend/app/engine/prompts/deliberation_system.txt` | Deliberation framing template |
| Create | `backend/app/engine/prompts/voting_prompt.txt` | Voting prompt template |
| Create | `backend/app/engine/prompts/continuation_nudge.txt` | Continuation nudge text |
| Create | `backend/tests/engine/test_prompts.py` | Tests for loader and render functions |
| Modify | `backend/app/engine/council.py` | Replace inline prompts with loader calls |
| Modify | `backend/tests/engine/test_council_helpers.py` | Update tests for changed function signatures |
| Modify | `backend/app/engine/CLAUDE.md` | Update engine docs for new prompts package |

---

## Chunk 1: Template Files and Loader

### Task 1: Create template files

**Files:**
- Create: `backend/app/engine/prompts/__init__.py`
- Create: `backend/app/engine/prompts/deliberation_system.txt`
- Create: `backend/app/engine/prompts/voting_prompt.txt`
- Create: `backend/app/engine/prompts/continuation_nudge.txt`

- [ ] **Step 1: Create the prompts package**

```bash
mkdir -p backend/app/engine/prompts
touch backend/app/engine/prompts/__init__.py
```

- [ ] **Step 2: Create `deliberation_system.txt`**

```text
You are {agent_name}, participating in a deliberation council called "{council_name}".

Council structure:
- Participants: {agent_list}
- Voting mechanism: {voting_mechanism}
- Total rounds: {rounds}

Your role is to engage in structured debate with the other council members. Consider their arguments carefully, challenge weak reasoning, and refine your position based on evidence presented. Be direct and substantive.

Your specific role and expertise:
{agent_system_prompt}
```

- [ ] **Step 3: Create `voting_prompt.txt`**

```text
The council has finished deliberating on the following claim:

"{input_claim}"

Here is the full debate:

{debate_text}

Based on the deliberation, please cast your vote. Respond with ONLY a JSON object in this exact format:
{vote_format}
Do not include any other text outside the JSON.
```

Note: The literal braces in `{vote_format}` are NOT format placeholders — `{vote_format}` is the only placeholder. The actual JSON example braces are injected by `loader.py` as a pre-built string.

- [ ] **Step 4: Create `continuation_nudge.txt`**

```text
Please continue the discussion. Respond to the points raised by other agents.
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/engine/prompts/__init__.py backend/app/engine/prompts/deliberation_system.txt backend/app/engine/prompts/voting_prompt.txt backend/app/engine/prompts/continuation_nudge.txt
git commit -m "feat: add prompt template files for deliberation, voting, and continuation"
```

---

### Task 2: Write failing tests for the loader

**Files:**
- Create: `backend/tests/engine/test_prompts.py`

- [ ] **Step 1: Write tests for `load_template`**

```python
"""Tests for prompt template loader — pure logic, no DB or LLM."""
from __future__ import annotations

import pytest

from app.engine.prompts.loader import (
    load_template,
    render_continuation_nudge,
    render_deliberation_system,
    render_voting_prompt,
)


class TestLoadTemplate:
    def test_loads_existing_template(self) -> None:
        text = load_template("continuation_nudge.txt")
        assert "continue" in text.lower()

    def test_caches_template(self) -> None:
        t1 = load_template("continuation_nudge.txt")
        t2 = load_template("continuation_nudge.txt")
        assert t1 is t2  # same object = cached

    def test_nonexistent_template_raises(self) -> None:
        with pytest.raises(FileNotFoundError):
            load_template("nonexistent.txt")


class TestRenderDeliberationSystem:
    def test_contains_all_context(self) -> None:
        result = render_deliberation_system(
            council_name="Ethics Board",
            agent_name="Critic",
            agent_list="Critic, Analyst, Synthesizer",
            voting_mechanism="majority",
            rounds=3,
            agent_system_prompt="You are a harsh critic.",
        )
        assert "Ethics Board" in result
        assert "Critic" in result
        assert "Analyst, Synthesizer" in result
        assert "majority" in result
        assert "3" in result
        assert "You are a harsh critic." in result

    def test_agent_prompt_preserved_verbatim(self) -> None:
        custom = "You are an expert in {domain} analysis."
        result = render_deliberation_system(
            council_name="Test",
            agent_name="Agent",
            agent_list="Agent",
            voting_mechanism="majority",
            rounds=1,
            agent_system_prompt=custom,
        )
        assert custom in result


class TestRenderVotingPrompt:
    def test_binary_contains_claim_and_format(self) -> None:
        result = render_voting_prompt(
            input_claim="The sky is blue",
            debate_text="[Alice]: Yes it is.\n\n[Bob]: I agree.",
            question_type="binary",
        )
        assert "The sky is blue" in result
        assert "[Alice]:" in result
        assert '"true"' in result or '"false"' in result
        assert '"confidence"' in result

    def test_open_uses_candidate_format(self) -> None:
        result = render_voting_prompt(
            input_claim="Best color?",
            debate_text="[Alice]: Red.",
            question_type="open",
        )
        assert "Best color?" in result
        assert "<your chosen candidate>" in result
        assert '"true" or "false"' not in result

    def test_debate_text_with_braces_preserved(self) -> None:
        result = render_voting_prompt(
            input_claim="claim",
            debate_text="[Alice]: The set {1, 2, 3} is finite.",
            question_type="binary",
        )
        assert "{1, 2, 3}" in result


class TestRenderContinuationNudge:
    def test_returns_nudge_text(self) -> None:
        result = render_continuation_nudge()
        assert "continue" in result.lower()
        assert len(result) > 10
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/engine/test_prompts.py -v
```

Expected: `ModuleNotFoundError: No module named 'app.engine.prompts.loader'`

- [ ] **Step 3: Commit failing tests**

```bash
git add backend/tests/engine/test_prompts.py
git commit -m "test: add failing tests for prompt template loader"
```

---

### Task 3: Implement the loader

**Files:**
- Create: `backend/app/engine/prompts/loader.py`

- [ ] **Step 1: Implement `loader.py`**

```python
"""Prompt template loader with caching and variable interpolation.

Templates are plain .txt files in this directory using {variable} placeholders.
Loaded once and cached in memory (templates don't change at runtime).

Uses str.replace() chains instead of str.format() because user-supplied content
(agent system prompts, debate text) can contain literal braces that would break
format().
"""
from __future__ import annotations

from pathlib import Path

_TEMPLATES_DIR = Path(__file__).parent
_cache: dict[str, str] = {}

# Pre-built vote format strings (injected as {vote_format} in voting_prompt.txt)
_BINARY_VOTE_FORMAT = (
    '{"value": "true" or "false", "confidence": 0.0 to 1.0, "reasoning": "your reasoning"}'
)
_OPEN_VOTE_FORMAT = (
    '{"value": "<your chosen candidate>", "confidence": 0.0 to 1.0, "reasoning": "your reasoning"}'
)


def load_template(name: str) -> str:
    """Load a template file by name, caching the result."""
    if name not in _cache:
        path = _TEMPLATES_DIR / name
        if not path.is_file():
            raise FileNotFoundError(f"Template not found: {path}")
        _cache[name] = path.read_text(encoding="utf-8")
    return _cache[name]


def _render(template: str, variables: dict[str, str]) -> str:
    """Replace {variable} placeholders using str.replace() — safe for user content with braces."""
    result = template
    for key, value in variables.items():
        result = result.replace("{" + key + "}", value)
    return result


def render_deliberation_system(
    *,
    council_name: str,
    agent_name: str,
    agent_list: str,
    voting_mechanism: str,
    rounds: int,
    agent_system_prompt: str,
) -> str:
    """Render the deliberation system prompt that wraps an agent's custom prompt."""
    template = load_template("deliberation_system.txt")
    return _render(template, {
        "council_name": council_name,
        "agent_name": agent_name,
        "agent_list": agent_list,
        "voting_mechanism": voting_mechanism,
        "rounds": str(rounds),
        "agent_system_prompt": agent_system_prompt,
    })


def render_voting_prompt(
    *,
    input_claim: str,
    debate_text: str,
    question_type: str = "binary",
) -> str:
    """Render the voting prompt with the appropriate vote format."""
    template = load_template("voting_prompt.txt")
    vote_format = _BINARY_VOTE_FORMAT if question_type == "binary" else _OPEN_VOTE_FORMAT
    return _render(template, {
        "input_claim": input_claim,
        "debate_text": debate_text,
        "vote_format": vote_format,
    })


def render_continuation_nudge() -> str:
    """Return the continuation nudge text."""
    return load_template("continuation_nudge.txt").strip()
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd backend && python -m pytest tests/engine/test_prompts.py -v
```

Expected: All 8 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/app/engine/prompts/loader.py
git commit -m "feat: implement prompt template loader with caching"
```

---

## Chunk 2: Wire Templates into Council Orchestrator

### Task 4: Update `council.py` to use templates

**Files:**
- Modify: `backend/app/engine/council.py`

- [ ] **Step 1: Add import for loader functions**

At the top of `council.py`, add:

```python
from app.engine.prompts.loader import (
    render_continuation_nudge,
    render_deliberation_system,
    render_voting_prompt,
)
```

- [ ] **Step 2: Update `run_council_session()` to build deliberation system prompts**

In `run_council_session()`, before the round loop (after loading agents), build the agent list string:

```python
agent_names = ", ".join(a.name for a in agents)
```

Then inside the agent loop, replace:

```python
content = await call_agent(agent, messages, agent.system_prompt)
```

with:

```python
system_prompt = render_deliberation_system(
    council_name=council.name,
    agent_name=agent.name,
    agent_list=agent_names,
    voting_mechanism=council.voting_mechanism,
    rounds=council.rounds,
    agent_system_prompt=agent.system_prompt,
)
content = await call_agent(agent, messages, system_prompt)
```

- [ ] **Step 3: Update voting phase to use `render_voting_prompt`**

Replace the voting prompt construction. Change:

```python
voting_prompt = _build_voting_prompt(session.input_claim, history)
```

to:

```python
debate_lines = []
for name, _, content_text in history:
    debate_lines.append(f"[{name}]: {content_text}")
debate_text = "\n\n".join(debate_lines)

voting_prompt = render_voting_prompt(
    input_claim=session.input_claim,
    debate_text=debate_text,
    question_type="binary",
)
```

Also update the system prompt passed to `call_agent` in the voting loop — use the same `render_deliberation_system()` call:

```python
vote_system_prompt = render_deliberation_system(
    council_name=council.name,
    agent_name=agent.name,
    agent_list=agent_names,
    voting_mechanism=council.voting_mechanism,
    rounds=council.rounds,
    agent_system_prompt=agent.system_prompt,
)
raw_vote = await call_agent(agent, vote_messages, vote_system_prompt)
```

- [ ] **Step 4: Update `_build_agent_messages()` to use template nudge**

Replace the hardcoded nudge string:

```python
messages.append({
    "role": "user",
    "content": "Please continue the discussion. Respond to the points raised by other agents.",
})
```

with:

```python
messages.append({
    "role": "user",
    "content": render_continuation_nudge(),
})
```

- [ ] **Step 5: Remove the old `_build_voting_prompt` function**

Delete the entire `_build_voting_prompt()` function (lines 209–228 of `council.py`). It's fully replaced by `render_voting_prompt()`.

- [ ] **Step 6: Update existing tests in `test_council_helpers.py`**

The `TestBuildVotingPrompt` class tests the now-deleted function. Update the import and remove the class.

Remove `_build_voting_prompt` from the import line in `backend/tests/engine/test_council_helpers.py`:

```python
from app.engine.council import _build_agent_messages, _parse_vote
```

Delete the entire `TestBuildVotingPrompt` class. The equivalent tests are in `test_prompts.py::TestRenderVotingPrompt`.

- [ ] **Step 7: Run the full test suite**

```bash
cd backend && python -m pytest tests/ -v
```

Expected: All tests PASS.

- [ ] **Step 8: Commit (council.py + test updates together to keep tests green)**

```bash
git add backend/app/engine/council.py backend/tests/engine/test_council_helpers.py
git commit -m "feat: wire prompt templates into council orchestrator"
```

---

### Task 5: Update docs

**Files:**
- Modify: `TODO.md`
- Modify: `backend/app/engine/CLAUDE.md`

- [ ] **Step 1: Check off all Stream A items in `TODO.md`**

Mark all 5 items in section 8 as complete (`[x]`).

- [ ] **Step 2: Update `backend/app/engine/CLAUDE.md`**

In the Helpers section, replace the `_build_voting_prompt` entry with documentation for the new `prompts/` package:

- Remove the `_build_voting_prompt` paragraph
- Add a new section for the `prompts/` package describing the template files and `loader.py`
- Update the `_build_agent_messages` paragraph to note the continuation nudge now comes from a template

- [ ] **Step 3: Commit**

```bash
git add TODO.md backend/app/engine/CLAUDE.md
git commit -m "docs: mark Stream A complete and update engine docs"
```
