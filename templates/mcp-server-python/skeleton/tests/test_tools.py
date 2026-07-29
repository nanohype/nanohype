"""Tests for individual tool execution and validation."""

import pytest
from mcp.server.fastmcp import FastMCP

from src.tools.example import Enthusiasm, GreetInput, format_greeting, register_example_tool


class TestGreetInput:
    """Test Pydantic input validation for the greet tool."""

    def test_valid_input(self) -> None:
        inp = GreetInput(name="Alice")
        assert inp.name == "Alice"
        assert inp.enthusiasm == Enthusiasm.MEDIUM

    def test_custom_enthusiasm(self) -> None:
        inp = GreetInput(name="Bob", enthusiasm=Enthusiasm.HIGH)
        assert inp.enthusiasm == Enthusiasm.HIGH

    def test_empty_name_rejected(self) -> None:
        with pytest.raises(Exception):
            GreetInput(name="")

    def test_enthusiasm_enum_values(self) -> None:
        for level in ["low", "medium", "high"]:
            inp = GreetInput(name="Test", enthusiasm=Enthusiasm(level))
            assert inp.enthusiasm.value == level


class TestFormatGreeting:
    """Test greeting formatting logic."""

    def test_low_enthusiasm(self) -> None:
        result = format_greeting("Alice", Enthusiasm.LOW)
        assert result == "Hello, Alice."

    def test_medium_enthusiasm(self) -> None:
        result = format_greeting("Bob", Enthusiasm.MEDIUM)
        assert "Bob" in result
        assert "Hello" in result

    def test_high_enthusiasm(self) -> None:
        result = format_greeting("Carol", Enthusiasm.HIGH)
        assert "HELLO" in result
        assert "Carol" in result

    def test_unicode_name(self) -> None:
        result = format_greeting("M\u00fcller", Enthusiasm.MEDIUM)
        assert "M\u00fcller" in result

    def test_single_char_name(self) -> None:
        result = format_greeting("X", Enthusiasm.LOW)
        assert "X" in result


class TestGreetToolExecution:
    """Test the greet tool through the MCP server."""

    @pytest.fixture
    def tool_server(self) -> FastMCP:
        server = FastMCP(name="test-server")
        register_example_tool(server)
        return server

    # FastMCP.call_tool returns (content_blocks, structured_result). Both halves
    # are asserted: a client reading the text blocks and one reading the
    # structured payload must agree, and checking only one would miss a tool
    # that populates it and drops the other.

    @pytest.mark.asyncio
    async def test_default_enthusiasm(self, tool_server: FastMCP) -> None:
        content, structured = await tool_server.call_tool("greet", {"name": "Alice"})
        assert len(content) > 0
        assert "Alice" in content[0].text
        assert structured["result"] == content[0].text

    @pytest.mark.asyncio
    async def test_low_enthusiasm(self, tool_server: FastMCP) -> None:
        content, structured = await tool_server.call_tool(
            "greet", {"name": "Bob", "enthusiasm": "low"}
        )
        assert content[0].text == "Hello, Bob."
        assert structured["result"] == "Hello, Bob."

    @pytest.mark.asyncio
    async def test_high_enthusiasm(self, tool_server: FastMCP) -> None:
        content, structured = await tool_server.call_tool(
            "greet", {"name": "Carol", "enthusiasm": "high"}
        )
        assert "HELLO" in content[0].text
        assert "Carol" in content[0].text
        assert structured["result"] == content[0].text
