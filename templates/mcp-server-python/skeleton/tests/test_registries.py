"""Tests for the tool and resource registration helpers.

These two wrappers are the pattern a consumer follows for every tool and
resource they add, so what matters is not that they return something — it is
that what they return actually lands on the server under the name and
description given. A wrapper that registered nothing, or registered under the
wrong name, would leave a server that starts cleanly and exposes an empty tool
list to its client.
"""

import pytest
from mcp.server.fastmcp import FastMCP

from src.resources.registry import register_resource
from src.tools.registry import register_tool


@pytest.fixture
def server() -> FastMCP:
    return FastMCP(name="registry-test")


class TestRegisterTool:
    @pytest.mark.asyncio
    async def test_registers_under_the_given_name(self, server: FastMCP) -> None:
        @register_tool(server, name="shout", description="Uppercase a word")
        def shout(word: str) -> str:
            return word.upper()

        tools = await server.list_tools()
        assert [t.name for t in tools] == ["shout"]

    @pytest.mark.asyncio
    async def test_carries_the_description_through(self, server: FastMCP) -> None:
        # The description is what an LLM selects on, so a wrapper that dropped
        # it would leave the tool callable but effectively invisible.
        @register_tool(server, name="shout", description="Uppercase a word")
        def shout(word: str) -> str:
            return word.upper()

        tools = await server.list_tools()
        assert tools[0].description == "Uppercase a word"

    @pytest.mark.asyncio
    async def test_the_registered_tool_is_callable(self, server: FastMCP) -> None:
        @register_tool(server, name="shout", description="Uppercase a word")
        def shout(word: str) -> str:
            return word.upper()

        content, structured = await server.call_tool("shout", {"word": "hey"})
        assert content[0].text == "HEY"
        assert structured["result"] == "HEY"

    def test_returns_the_function_so_it_stays_directly_callable(self, server: FastMCP) -> None:
        # Registration must not replace the function with the decorator's
        # bookkeeping — the module that defines a tool usually also unit-tests
        # it directly, without a server.
        @register_tool(server, name="shout", description="Uppercase a word")
        def shout(word: str) -> str:
            return word.upper()

        assert shout("hey") == "HEY"

    @pytest.mark.asyncio
    async def test_registrations_are_scoped_to_their_server(self) -> None:
        # State is instance-scoped by design; a module-level registry would
        # leak tools between servers in the same process.
        first, second = FastMCP(name="first"), FastMCP(name="second")

        @register_tool(first, name="only-on-first", description="…")
        def only_on_first() -> str:
            return "x"

        assert [t.name for t in await first.list_tools()] == ["only-on-first"]
        assert await second.list_tools() == []


class TestRegisterResource:
    @pytest.mark.asyncio
    async def test_registers_under_the_given_uri(self, server: FastMCP) -> None:
        @register_resource(server, "config://theme", name="Theme", mime_type="application/json")
        def theme() -> str:
            return '{"theme": "dark"}'

        resources = await server.list_resources()
        assert [str(r.uri) for r in resources] == ["config://theme"]

    @pytest.mark.asyncio
    async def test_carries_name_and_mime_type_through(self, server: FastMCP) -> None:
        @register_resource(
            server,
            "config://theme",
            name="Theme",
            description="UI theme",
            mime_type="application/json",
        )
        def theme() -> str:
            return '{"theme": "dark"}'

        resource = (await server.list_resources())[0]
        assert resource.name == "Theme"
        assert resource.description == "UI theme"
        assert resource.mimeType == "application/json"

    @pytest.mark.asyncio
    async def test_the_registered_resource_is_readable(self, server: FastMCP) -> None:
        @register_resource(server, "config://theme", name="Theme")
        def theme() -> str:
            return '{"theme": "dark"}'

        contents = list(await server.read_resource("config://theme"))
        assert contents[0].content == '{"theme": "dark"}'

    @pytest.mark.asyncio
    async def test_optional_metadata_may_be_omitted(self, server: FastMCP) -> None:
        # Every keyword defaults to None; passing none of them must still
        # produce a resource a client can list.
        @register_resource(server, "config://bare")
        def bare() -> str:
            return "x"

        assert [str(r.uri) for r in await server.list_resources()] == ["config://bare"]
