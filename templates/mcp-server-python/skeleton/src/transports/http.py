"""Streamable HTTP transport for the MCP server.

Exposes the MCP server over HTTP using FastAPI and the streamable-http
transport. Use this when the server runs as a standalone service
rather than a client-spawned subprocess.
"""

from mcp.server.fastmcp import FastMCP

from ..config import Config
from ..logger import get_logger

logger = get_logger("transport.http")


def start(server: FastMCP, config: Config | None = None) -> None:
    """Start the MCP server using streamable HTTP transport.

    Args:
        server: The configured FastMCP server instance.
        config: Optional configuration for host/port. Falls back to defaults.
    """
    if config is None:
        config = Config()

    logger.info(
        "server.transport",
        transport="streamable-http",
        host=config.host,
        port=config.port,
    )
    server.run(
        transport="streamable-http",
        host=config.host,
        port=config.port,
    )
