# Agent Council

A multi-agent deliberation framework where AI agents — each with a custom system prompt — debate a question, challenge each other, and reach a verdict via configurable voting. The debate is visualised in a real-time multi-panel UI.

## Architecture

| Layer        | Technology                         | Runs in                    |
|--------------|------------------------------------|----------------------------|
| Frontend     | Angular 21, Angular Material, Vite | Local (dev) / Docker (prod)|
| Backend      | FastAPI, Python 3.12, Pydantic     | Docker                     |
| Database     | PostgreSQL 16                      | Docker                     |
| LLM          | Anthropic Claude API               | External                   |
| Live updates | Server-Sent Events (SSE)           | —                          |

## Prerequisites

- **Docker Desktop** — for backend + database
- **Node.js 20+** and **npm** — for frontend development
- **Anthropic API key** — for LLM features

## Quickstart

### 1. Configure environment

```bash
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
```

### 2. Start backend (Terminal 1)

```bash
./start-backend.sh
```

Builds and starts PostgreSQL and FastAPI via Docker Compose.
The API is available at http://localhost:8000.

### 3. Start frontend (Terminal 2)

```bash
./start-frontend.sh
```

Installs npm dependencies (if needed) and starts the Angular dev server with Vite.
The app is available at http://localhost:4200.
API requests to `/api/*` are proxied to the backend.

## Production Deployment

For production, all three services run in Docker:

```bash
docker compose up --build
```

| Service  | URL                    |
|----------|------------------------|
| Frontend | http://localhost:4200   |
| Backend  | http://localhost:8000   |
| Database | localhost:5432          |

## Project Structure

```
agent-council/
├── frontend/           # Angular 21 app (Vite dev server)
├── backend/            # FastAPI app (Docker)
├── docker-compose.yml  # All services (db, backend, frontend)
├── start-backend.sh    # Dev: Docker db + backend
├── start-frontend.sh   # Dev: Local Angular + Vite
├── run-tests.sh        # Run all tests
├── test-backend.sh     # Backend tests (pytest)
├── test-frontend.sh    # Frontend tests (Vitest)
├── .env.example        # Environment template
└── CLAUDE.md           # AI development instructions
```

## Environment Variables

| Variable            | Description                  | Default                                                    |
|---------------------|------------------------------|------------------------------------------------------------|
| `ANTHROPIC_API_KEY` | Anthropic Claude API key     | *(required)*                                               |
| `DATABASE_URL`      | PostgreSQL connection string | `postgresql+asyncpg://agent:agent@db:5432/agentcouncil`    |

## API Endpoints

| Method | Path                               | Description                 |
|--------|------------------------------------|-----------------------------|
| POST   | `/api/v1/agents`                   | Create an agent             |
| GET    | `/api/v1/agents`                   | List all agents             |
| POST   | `/api/v1/councils`                 | Create a council            |
| GET    | `/api/v1/councils`                 | List all councils           |
| GET    | `/api/v1/councils/{id}`            | Get a council               |
| POST   | `/api/v1/sessions`                 | Create a new session        |
| GET    | `/api/v1/sessions/{id}/stream`     | SSE stream of debate events |
| POST   | `/api/v1/sessions/{id}/human-turn` | Inject human input          |
| GET    | `/api/v1/sessions/{id}/verdict`    | Get final verdict           |

## Testing

```bash
./run-tests.sh          # run all tests (backend + frontend)
./test-backend.sh       # backend only (pytest)
./test-frontend.sh      # frontend only (Vitest)
```

Each script auto-installs dependencies if needed. Backend tests use an in-memory SQLite database — no PostgreSQL or Docker required.

You can pass extra arguments through to the test runner:

```bash
./test-backend.sh tests/test_voting.py -v    # run a single file
./test-frontend.sh --watch                   # watch mode
```

## Voting Mechanisms

| Mechanism       | Behaviour                                              |
|-----------------|--------------------------------------------------------|
| `majority`      | Simple majority of agent votes                         |
| `weighted`      | Votes weighted by agent-reported confidence            |
| `consensus`     | All agents must agree; extra rounds triggered otherwise|
| `human_in_loop` | User reviews debate, casts deciding vote via the UI    |
