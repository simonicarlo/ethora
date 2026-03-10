# Schemas — CLAUDE.md

## Purpose
Pydantic models for request validation and response serialization.

## Key Patterns
- **Literal types**: `VotingMechanism` and `SessionStatus` use `Literal` for exhaustive validation
- **Field constraints**: Names have `min_length`/`max_length`, rounds have `ge`/`le`, confidence has bounds
- **from_attributes=True**: Response models can serialize directly from SQLAlchemy ORM objects
- **Separate Create/Response models**: Create models validate input; Response models include `id` and timestamps
