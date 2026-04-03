"""Tests for MCP server lifecycle and tool listing."""

import pytest

from mcp.server.fastmcp import FastMCP

from src.config import Config
from src.server import create_server


class TestServerCreation:
    """Test server factory and configuration."""

    def test_creates_server_instance(self, config: Config) -> None:
        server = create_server(config)
        assert isinstance(server, FastMCP)

    def test_server_has_correct_name(self, config: Config) -> None:
        server = create_server(config)
        assert server.name == "test-server"

    def test_separate_instances_are_independent(self, config: Config) -> None:
        server_a = create_server(config)
        server_b = create_server(config)
        assert server_a is not server_b


class TestToolListing:
    """Test that tools are registered correctly."""

    @pytest.mark.asyncio
    async def test_greet_tool_is_registered(self, server: FastMCP) -> None:
        tools = await server.list_tools()
        names = [t.name for t in tools]
        assert "greet" in names

    @pytest.mark.asyncio
    async def test_greet_tool_has_description(self, server: FastMCP) -> None:
        tools = await server.list_tools()
        greet = next(t for t in tools if t.name == "greet")
        assert greet.description
        assert len(greet.description) > 0

    @pytest.mark.asyncio
    async def test_greet_tool_has_input_schema(self, server: FastMCP) -> None:
        tools = await server.list_tools()
        greet = next(t for t in tools if t.name == "greet")
        assert greet.inputSchema is not None
        assert greet.inputSchema.get("type") == "object"
        assert "name" in greet.inputSchema.get("properties", {})


class TestResourceListing:
    """Test that resources are registered correctly."""

    @pytest.mark.asyncio
    async def test_server_info_resource_is_registered(self, server: FastMCP) -> None:
        resources = await server.list_resources()
        uris = [str(r.uri) for r in resources]
        assert "info://server" in uris
