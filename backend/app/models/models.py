from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Table, Text
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def _utcnow() -> datetime:
    """Explicit UTC timezone ensures consistent timestamps regardless of server locale."""
    return datetime.now(timezone.utc)


# Plain association table (not an ORM model) because the M:N relationship
# carries no extra fields — just the two foreign keys.
council_agents = Table(
    "council_agents",
    Base.metadata,
    Column("council_id", ForeignKey("councils.id"), primary_key=True),
    Column("agent_id", ForeignKey("agents.id"), primary_key=True),
)


class Agent(Base):
    __tablename__ = "agents"

    # default=uuid.uuid4 (callable, not uuid4()) — SQLAlchemy calls it per-row to generate unique IDs.
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String, nullable=False)
    system_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    model: Mapped[str] = mapped_column(String, default="claude-sonnet-4-20250514")


class Council(Base):
    __tablename__ = "councils"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String, nullable=False)
    rounds: Mapped[int] = mapped_column(Integer, default=3)
    voting_mechanism: Mapped[str] = mapped_column(String, default="majority")
    allow_human_turns: Mapped[bool] = mapped_column(Boolean, default=False)
    tools_enabled: Mapped[bool] = mapped_column(Boolean, default=False)

    # lazy="selectin": eagerly loads related objects in a second SELECT.
    # Required because async SQLAlchemy forbids implicit lazy loading (no sync I/O).
    agents: Mapped[list[Agent]] = relationship("Agent", secondary=council_agents, lazy="selectin")


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    council_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("councils.id"), nullable=False)
    input_claim: Mapped[str] = mapped_column(Text, nullable=False)
    question_type: Mapped[str] = mapped_column(String, default="binary")
    status: Mapped[str] = mapped_column(String, default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    council: Mapped[Council] = relationship("Council", lazy="selectin")
    rounds: Mapped[list[Round]] = relationship("Round", back_populates="session", lazy="selectin")
    votes: Mapped[list[Vote]] = relationship("Vote", back_populates="session", lazy="selectin")
    verdict: Mapped[Verdict | None] = relationship("Verdict", back_populates="session", uselist=False, lazy="selectin")


class Round(Base):
    __tablename__ = "rounds"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sessions.id"), nullable=False)
    round_number: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    session: Mapped[Session] = relationship("Session", back_populates="rounds")
    messages: Mapped[list[Message]] = relationship("Message", back_populates="round", lazy="selectin")


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    round_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("rounds.id"), nullable=False)
    agent_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("agents.id"), nullable=True)
    message_type: Mapped[str] = mapped_column(String, default="agent", nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    references: Mapped[list[dict[str, str | None]] | None] = mapped_column(JSON, nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    round: Mapped[Round] = relationship("Round", back_populates="messages")
    agent: Mapped[Agent | None] = relationship("Agent", lazy="selectin")


class Vote(Base):
    __tablename__ = "votes"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sessions.id"), nullable=False)
    agent_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agents.id"), nullable=False)
    value: Mapped[str] = mapped_column(String, nullable=False)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    reasoning: Mapped[str | None] = mapped_column(Text, nullable=True)

    session: Mapped[Session] = relationship("Session", back_populates="votes")
    agent: Mapped[Agent] = relationship("Agent", lazy="selectin")


class Verdict(Base):
    __tablename__ = "verdicts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sessions.id"), unique=True, nullable=False)
    decision: Mapped[str] = mapped_column(String, nullable=False)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    session: Mapped[Session] = relationship("Session", back_populates="verdict")


class AppSetting(Base):
    __tablename__ = "app_settings"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    key: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    encrypted_value: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)
