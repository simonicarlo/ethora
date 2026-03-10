# Models — CLAUDE.md

## Purpose
SQLAlchemy ORM models defining the database schema.

## Entity Relationships
```
Council <-M:N-> Agent        (via council_agents association table)
Session -> Council          (many sessions per council)
Session -> Round[]          (ordered by round_number)
Round -> Message[]          (one per agent per round)
Session -> Vote[]           (one per agent after deliberation)
Session -> Verdict          (one-to-one, final decision)
```

## Key Design Choices
- **UUID primary keys**: All entities use `uuid.uuid4` for IDs (no auto-increment)
- **Mapped annotations**: Uses SQLAlchemy 2.0 `Mapped[T]` + `mapped_column()` style
- **lazy="selectin"**: Relationships use selectin loading to avoid N+1 in async context
- **UTC timestamps**: `_utcnow()` helper ensures consistent timezone-aware datetimes
- **Association table**: Council-Agent M:N uses plain `Table` (no association model needed)
