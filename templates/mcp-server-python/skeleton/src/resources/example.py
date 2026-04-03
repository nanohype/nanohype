"""Example resource demonstrating the MCP resource pattern.

This demonstrates the standard pattern for defining a resource:

  1. Create a registration function that receives the server
  2. Use the @server.resource() decorator with a URI
  3. Return content from the handler (string or dict)

Resources are read-only data endpoints. MCP clients can list them
and read their contents. Unlike tools, resources are not invoked
by the LLM -- they provide context that can be attached to the
conversation.

To add your own resource, copy this file, change the URI/handler,
and register it in src/server.py.
"""

import json

from mcp.server.fastmcp import FastMCP

from ..config import Config


def register_example_resource(server: FastMCP, config: Config) -> None:
    """Register the server-info example resource.

    Args:
        server: The FastMCP server instance to register on.
        config: Application configuration for server metadata.
    """

    @server.resource(
        "info://server",
        name="server-info",
        description="Basic information about this MCP server, including its name and capabilities.",
        mime_type="application/json",
    )
    def server_info() -> str:
        """Return server metadata as JSON."""
        info = {
            "name": config.server_name,
            "version": config.server_version,
            "description": "__DESCRIPTION__",
            "transport": "__TRANSPORT__",
        }
        return json.dumps(info, indent=2)
