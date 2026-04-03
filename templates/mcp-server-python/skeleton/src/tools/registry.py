"""Tool registry helpers.

Provides a decorator-based pattern for defining MCP tools with
Pydantic input validation. Tools are registered on a FastMCP server
instance, keeping all mutable state instance-scoped.

Usage:
    from mcp.server.fastmcp import FastMCP
    from pydantic import BaseModel

    class MyInput(BaseModel):
        name: str

    def register_my_tool(server: FastMCP) -> None:
        @server.tool(name="my-tool", description="Does something useful")
        def my_tool(name: str) -> str:
            return f"Hello, {name}"
"""

from collections.abc import Callable
from typing import Any

from mcp.server.fastmcp import FastMCP


def register_tool(
    server: FastMCP,
    *,
    name: str,
    description: str,
) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """Register a tool on the given server instance.

    This is a convenience wrapper around server.tool() that provides
    a consistent registration pattern. Use it when you want to
    define tools with explicit name and description parameters.

    Args:
        server: The FastMCP server to register the tool on.
        name: Tool name visible to MCP clients.
        description: Human-readable description for LLM tool selection.

    Returns:
        A decorator that registers the function as an MCP tool.

    Example:
        @register_tool(server, name="greet", description="Say hello")
        def greet(name: str) -> str:
            return f"Hello, {name}!"
    """
    return server.tool(name=name, description=description)
