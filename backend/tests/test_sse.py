from __future__ import annotations

import json

from app.sse.emitter import format_sse


class TestFormatSSE:
    def test_correct_format(self) -> None:
        result = format_sse("agent_message", {"agent_id": "a1", "content": "hello"})
        assert result.startswith("event: agent_message\n")
        assert result.endswith("\n\n")
        # Extract the data line
        lines = result.strip().split("\n")
        assert lines[0] == "event: agent_message"
        data = json.loads(lines[1].removeprefix("data: "))
        assert data["agent_id"] == "a1"
        assert data["content"] == "hello"

    def test_nested_data(self) -> None:
        nested = {"outer": {"inner": [1, 2, 3]}, "flag": True}
        result = format_sse("complex", nested)
        lines = result.strip().split("\n")
        data = json.loads(lines[1].removeprefix("data: "))
        assert data["outer"]["inner"] == [1, 2, 3]
        assert data["flag"] is True
