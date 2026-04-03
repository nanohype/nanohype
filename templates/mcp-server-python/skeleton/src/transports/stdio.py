"""Stdio transport for the MCP server.

The MCP client spawns this process as a subprocess and communicates
over stdin/stdout. This is the standard transport for desktop
integrations (Claude Desktop, Cursor, etc.).
"""

from mcp.server.fastmcp import FastMCP

from ..logger import get_logger

logger = get_logger("transport.stdio")


def start(server: FastMCP) -> None:
    """Start the MCP server using stdio transport.

    Args:
        server: The configured FastMCP server instance.
    """
    logger.info("server.transport", transport="stdio")
    server.run(transport="stdio")
