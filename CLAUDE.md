# CLAUDE.md — Agent Council

## Project Overview

Agent Council is a multi-agent deliberation framework. AI agents (each with a custom system prompt) debate a question, challenge each other, and reach a verdict via a configurable voting mechanism. The debate is visualised in a real-time multi-panel UI.

---

## Monorepo Structure

```
agent-council/
├── frontend/          # Angular 17+ app
├── backend/           # FastAPI app
├── docker-compose.yml
├── .env               # secrets (never commit)
└── CLAUDE.md
```

---

## Tech Stack

| Layer      | Technology                                      |
|------------|-------------------------------------------------|
| Frontend   | Angular 17+ (standalone components, Signals)    |
| UI Library | Angular Material                                |
| Backend    | FastAPI, Python 3.12, Pydantic                  |
| LLM        | Anthropic Claude API (`anthropic` Python SDK)   |
| Live updates | SSE (backend pushes; frontend via `EventSource` + RxJS) |
| Database   | PostgreSQL 16, SQLAlchemy ORM, Alembic          |
| Deployment | Docker Compose                                  |

---

## Core Domain Concepts

- **Agent** — LLM instance shaped by a system prompt (role, personality, expertise)
- **Council** — Named group of agents + discussion protocol + voting config
- **Session** — One full deliberation run on a specific input
- **Round** — One full cycle where every agent responds to the current debate state
- **Human Turn** — Optional user input injected between rounds
- **Verdict** — Final decision + full reasoning trail
- **Wrapper** — Domain-specific config (system prompts, voting rules, I/O schema)

---

## Backend

### Directory layout

```
backend/
├── app/
│   ├── main.py              # FastAPI app + lifespan
│   ├── api/
│   │   └── v1/
│   │       ├── councils.py  # CRUD for councils
│   │       ├── sessions.py  # start session, stream, human turn, verdict
│   │       └── deps.py      # shared dependencies (DB session, etc.)
│   ├── core/
│   │   ├── config.py        # settings via pydantic-settings
│   │   └── database.py      # SQLAlchemy engine + session factory
│   ├── models/              # SQLAlchemy ORM models
│   │   └── models.py        # Session, Round, Agent, Message, Vote, Verdict
│   ├── schemas/             # Pydantic request/response schemas
│   │   └── schemas.py
│   ├── engine/              # Core deliberation logic
│   │   ├── council.py       # orchestrates rounds
│   │   ├── agent.py         # calls Claude API, returns full response
│   │   └── voting.py        # majority / weighted / consensus / human_in_loop
│   └── sse/
│       └── emitter.py       # SSE event helpers
├── alembic/
├── requirements.txt
└── Dockerfile
```

### Key rules
- All endpoints are `async`; agent LLM calls are sequential within a round (each agent sees all prior responses before replying)
- No token-level streaming — SSE fires once per **completed** agent response
- Use `python-dotenv` to load `.env`; never hardcode secrets
- Fully typed — all functions have type annotations; all I/O uses Pydantic models

### Environment variables (`.env`)

```
ANTHROPIC_API_KEY=sk-...
DATABASE_URL=postgresql+asyncpg://agent:agent@db:5432/agentcouncil
```

### Setup

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Requirements (requirements.txt baseline)

```
fastapi
uvicorn[standard]
pydantic-settings
anthropic
sqlalchemy[asyncio]
asyncpg
alembic
python-dotenv
```

---

## Frontend

### Directory layout

```
frontend/
├── src/
│   ├── app/
│   │   ├── app.config.ts          # standalone bootstrap
│   │   ├── app.routes.ts
│   │   ├── core/
│   │   │   ├── api.service.ts     # HttpClient wrapper
│   │   │   └── sse.service.ts     # EventSource → RxJS Observable
│   │   ├── features/
│   │   │   ├── council/           # council create/edit
│   │   │   ├── session/           # session view (debate + voting + verdict panels)
│   │   │   └── home/
│   │   └── shared/
│   │       └── components/
├── proxy.conf.json                # dev proxy → FastAPI
├── angular.json
└── Dockerfile
```

### Key rules
- Standalone components only — no `NgModules`
- State via Angular Signals — no NgRx or other external state libraries
- HTTP via `HttpClient` (provide via `provideHttpClient()` in `app.config.ts`)
- SSE consumption: `new EventSource(url)` wrapped in an RxJS `Observable` in `SseService`
- Use Angular Material for all UI components
- Graph visualisation panel is **deferred** — do not implement for PoC

### Dev proxy (`proxy.conf.json`)

```json
{
  "/api": {
    "target": "http://localhost:8000",
    "secure": false,
    "changeOrigin": true
  }
}
```

Reference in `angular.json` under `serve.options.proxyConfig`.

### Setup

```bash
cd frontend
npm install
ng serve --proxy-config proxy.conf.json
```

---

## Database

### Core entities

| Entity    | Key fields                                                             |
|-----------|------------------------------------------------------------------------|
| `Agent`   | `id`, `name`, `system_prompt`, `model`                                 |
| `Council` | `id`, `name`, `rounds`, `voting_mechanism`, `allow_human_turns`        |
| `Session` | `id`, `council_id`, `input_claim`, `status`, `created_at`              |
| `Round`   | `id`, `session_id`, `round_number`                                     |
| `Message` | `id`, `round_id`, `agent_id`, `content`, `created_at`                  |
| `Vote`    | `id`, `session_id`, `agent_id`, `value`, `confidence`, `reasoning`     |
| `Verdict` | `id`, `session_id`, `decision`, `confidence`, `summary`, `created_at`  |

### Migrations
- For PoC: `Base.metadata.create_all()` on startup is acceptable
- For production: use Alembic (`alembic init alembic`, generate revisions)

---

## Docker Compose

```yaml
# docker-compose.yml (skeleton — fill in details)
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: agent
      POSTGRES_PASSWORD: agent
      POSTGRES_DB: agentcouncil
    volumes:
      - pgdata:/var/lib/postgresql/data

  backend:
    build: ./backend
    env_file: .env
    depends_on: [db]
    ports:
      - "8000:8000"

  frontend:
    build: ./frontend
    ports:
      - "4200:80"   # nginx serves the Angular build

volumes:
  pgdata:
```

```bash
# One-command startup
docker compose up --build
```

---

## Session Flow (implementation reference)

```
POST /api/v1/sessions          → create session, return session_id
GET  /api/v1/sessions/{id}/stream  → SSE stream; emits event per completed agent message
POST /api/v1/sessions/{id}/human-turn  → inject user message between rounds
GET  /api/v1/sessions/{id}/verdict     → retrieve final verdict once complete
```

### SSE event shape

```json
{ "event": "agent_message", "data": { "agent_id": "...", "round": 1, "content": "..." } }
{ "event": "round_complete", "data": { "round": 1 } }
{ "event": "voting_cast",    "data": { "agent_id": "...", "vote": "true", "confidence": 0.85 } }
{ "event": "verdict",        "data": { "decision": "...", "confidence": 0.9, "summary": "..." } }
```

---

## Voting Mechanisms

| Mechanism       | Behaviour                                                        |
|-----------------|------------------------------------------------------------------|
| `majority`      | Simple majority of agent votes                                   |
| `weighted`      | Votes weighted by agent-reported confidence                      |
| `consensus`     | All agents must agree; extra rounds triggered otherwise          |
| `human_in_loop` | User reviews debate, casts deciding vote via the UI              |

---

## Ideas Tracking

An `IDEAS.md` file in the project root is Claude's scratchpad for project ideas.

### Rules
- **Write to it whenever an interesting idea comes up** during development — don't wait to be asked
- Ideas are things like architectural possibilities, UX improvements, new wrappers/use cases, or patterns worth exploring
- **Not for bugs or actionable work** — those go in `TODO.md`
- Keep entries short (2-3 sentences max) with a bold title
- Group by area, same as TODO.md
- Add a `---` separator between groups
- If an idea gets promoted to real work, move it to `TODO.md` and note it was from IDEAS.md

---

## TODO Tracking

A `TODO.md` file in the project root tracks all pending implementation work.

### Rules
- **When you encounter or create a TODO** in code, add a corresponding entry to `TODO.md` under the appropriate section
- **When you complete a TODO**, check it off (`[x]`) in `TODO.md` and remove the inline `# TODO` comment from the code
- **Keep items grouped** by area (Engine, Backend API, Frontend UI, Infrastructure, Future)
- **Order by priority** within each group — most impactful items first
- **Never delete uncompleted items** — if something is deferred, move it to the Future section with a note
- **Keep descriptions short** — one line per item, with the file/function reference in bold when relevant

---

## Workflow Conventions

### Branching
- **Never commit directly to `main`**. All work goes on a feature branch and merges via PR.
- Branch naming: `feature/`, `fix/`, `infra/`, `docs/` prefixes (e.g., `feature/engine-core`, `fix/sse-db-lifetime`)
- Keep branches focused — one TODO group or logical unit of work per branch

### Commits
- Use **Conventional Commit** prefixes: `feat:`, `fix:`, `refactor:`, `infra:`, `docs:`
- Write concise messages focused on "why", not "what"
- Stage specific files — never use `git add -A` or `git add .`
- Claude includes `Co-Authored-By` trailer on all commits

### Pull Requests (Bitbucket)
- Claude pushes branches and prepares PR descriptions
- PRs are created manually in the Bitbucket UI (no `gh` CLI)
- PR description format: Summary bullets + test plan checklist
- All work merges to `main` via PR — no direct pushes

### Code Reviews
- Ask Claude to review diffs before merging: "review the diff on branch X"
- Claude checks for: bugs, security issues, style consistency, missing types, test coverage gaps

---

## Phase 2 — Fact Checker Wrapper (future)

Suggested agents: **Source Critic**, **Logical Analyst**, **Devil's Advocate**, **Synthesizer**  
Default voting: `weighted` (by confidence)  
Human turns: enabled  
Output: credibility score + explanation + reasoning trail
