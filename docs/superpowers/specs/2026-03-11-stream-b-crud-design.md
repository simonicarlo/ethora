# Stream B — Agent & Council CRUD (Edit + Delete)

> Design spec for TODO.md § 9. Contracts defined in SPEC.md.

## Backend

### New Schemas (`schemas.py`)

- `AgentUpdate` — all fields optional: `name`, `system_prompt`, `model`
- `CouncilUpdate` — all fields optional: `name`, `rounds`, `voting_mechanism`, `allow_human_turns`, `agent_ids` (min 2 if provided)

### New Endpoints (`councils.py`)

| Method | Path | Response | Notes |
|--------|------|----------|-------|
| `PUT` | `/api/v1/agents/{id}` | `AgentResponse` (200) | Partial update |
| `DELETE` | `/api/v1/agents/{id}` | 204 | 409 if any council would have <2 agents |
| `PUT` | `/api/v1/councils/{id}` | `CouncilResponse` (200) | Partial update, swaps agent_ids |
| `DELETE` | `/api/v1/councils/{id}` | 204 | 409 if active sessions exist |

## Frontend

### Shared Form Components (refactor)

- `AgentCreate` → `AgentForm` — accepts optional `agentId` input signal; if set, fetches and pre-populates; submit routes to update or create
- `CouncilCreate` → `CouncilForm` — same pattern with `councilId` input

### List View Changes

- `AgentList` — add edit (routerLink) and delete (`window.confirm`) buttons per card
- `CouncilList` — same

### New Routes (`app.routes.ts`)

- `/agents/:id/edit` → `AgentForm`
- `/councils/:id/edit` → `CouncilForm`

### API Service Additions (`api.service.ts`)

- `updateAgent(id, data)`, `deleteAgent(id)`
- `updateCouncil(id, data)`, `deleteCouncil(id)`

### Model Additions (`models.ts`)

- `AgentUpdate` — `Partial<AgentCreate>`
- `CouncilUpdate` — `Partial<CouncilCreate>`
