"""Tests for individual tool execution and validation."""

import pytest

from src.tools.example import Enthusiasm, GreetInput, format_greeting, register_example_tool

from mcp.server.fastmcp import FastMCP


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
        server = FastMCP(name="test-server", version="0.0.1")
        register_example_tool(server)
        return server

    @pytest.mark.asyncio
    async def test_default_enthusiasm(self, tool_server: FastMCP) -> None:
        result = await tool_server.call_tool("greet", {"name": "Alice"})
        assert len(result) > 0
        assert "Alice" in result[0].text

    @pytest.mark.asyncio
    async def test_low_enthusiasm(self, tool_server: FastMCP) -> None:
        result = await tool_server.call_tool("greet", {"name": "Bob", "enthusiasm": "low"})
        assert result[0].text == "Hello, Bob."

    @pytest.mark.asyncio
    async def test_high_enthusiasm(self, tool_server: FastMCP) -> None:
        result = await tool_server.call_tool("greet", {"name": "Carol", "enthusiasm": "high"})
        assert "HELLO" in result[0].text
        assert "Carol" in result[0].text
