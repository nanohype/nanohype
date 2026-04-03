"""Resource registry helpers.

Provides a consistent pattern for registering MCP resources on a
server instance. Resources are read-only data endpoints that MCP
clients can list and read. Unlike tools, resources are not invoked
by the LLM -- they provide context that can be attached to the
conversation.

Usage:
    from mcp.server.fastmcp import FastMCP

    def register_my_resource(server: FastMCP) -> None:
        @server.resource("config://settings")
        def get_settings() -> str:
            return '{"theme": "dark"}'
"""

from collections.abc import Callable
from typing import Any

from mcp.server.fastmcp import FastMCP


def register_resource(
    server: FastMCP,
    uri: str,
    *,
    name: str | None = None,
    description: str | None = None,
    mime_type: str | None = None,
) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """Register a resource on the given server instance.

    This is a convenience wrapper around server.resource() that
    provides a consistent registration pattern.

    Args:
        server: The FastMCP server to register the resource on.
        uri: Resource URI or URI template.
        name: Optional display name for client UIs.
        description: Human-readable description of the resource.
        mime_type: MIME type of the resource content.

    Returns:
        A decorator that registers the function as an MCP resource.
    """
    return server.resource(uri, name=name, description=description, mime_type=mime_type)
