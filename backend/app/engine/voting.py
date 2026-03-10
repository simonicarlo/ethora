from __future__ import annotations

from app.models.models import Vote
from app.schemas.schemas import VotingMechanism


async def tally_votes(votes: list[Vote], mechanism: VotingMechanism) -> dict[str, str | float]:
    """Routes to the correct voting mechanism. TODO: implement."""
    raise NotImplementedError("Voting mechanisms not yet implemented")
