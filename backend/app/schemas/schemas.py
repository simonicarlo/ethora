from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

VotingMechanism = Literal["majority", "weighted", "consensus", "human_in_loop"]
SessionStatus = Literal["pending", "running", "voting", "awaiting_human_turn", "complete", "error"]


# -- Agents ------------------------------------------------------------------

class AgentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    system_prompt: str = Field(min_length=1)
    model: str = "claude-sonnet-4-20250514"


class AgentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    system_prompt: str | None = Field(default=None, min_length=1)
    model: str | None = None


class AgentResponse(BaseModel):
    id: uuid.UUID
    name: str
    system_prompt: str
    model: str

    model_config = ConfigDict(from_attributes=True)


# -- Councils -----------------------------------------------------------------

class CouncilCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    rounds: int = Field(default=3, ge=1, le=20)
    voting_mechanism: VotingMechanism = "majority"
    allow_human_turns: bool = False
    agent_ids: list[uuid.UUID] = Field(min_length=2)


class CouncilUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    rounds: int | None = Field(default=None, ge=1, le=20)
    voting_mechanism: VotingMechanism | None = None
    allow_human_turns: bool | None = None
    agent_ids: list[uuid.UUID] | None = Field(default=None, min_length=2)


class CouncilResponse(BaseModel):
    id: uuid.UUID
    name: str
    rounds: int
    voting_mechanism: VotingMechanism
    allow_human_turns: bool
    agents: list[AgentResponse]

    model_config = ConfigDict(from_attributes=True)


# -- Sessions -----------------------------------------------------------------

class SessionCreate(BaseModel):
    council_id: uuid.UUID
    input_claim: str = Field(min_length=1, max_length=5000)


class SessionResponse(BaseModel):
    id: uuid.UUID
    council_id: uuid.UUID
    input_claim: str
    status: SessionStatus
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# -- Messages -----------------------------------------------------------------

class MessageResponse(BaseModel):
    id: uuid.UUID
    round_id: uuid.UUID
    agent_id: uuid.UUID | None = None
    content: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# -- Votes --------------------------------------------------------------------

class VoteResponse(BaseModel):
    id: uuid.UUID
    agent_id: uuid.UUID
    value: str
    confidence: float | None = None
    reasoning: str | None = None

    model_config = ConfigDict(from_attributes=True)


# -- Verdicts -----------------------------------------------------------------

class VerdictResponse(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    decision: str
    confidence: float | None = None
    summary: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# -- Human Turn ---------------------------------------------------------------

class HumanTurnRequest(BaseModel):
    content: str = Field(min_length=1)


class HumanTurnResponse(BaseModel):
    status: str


class HumanVoteRequest(BaseModel):
    decision: str = Field(min_length=1)
    confidence: float = Field(ge=0.0, le=1.0)
    reasoning: str | None = None
