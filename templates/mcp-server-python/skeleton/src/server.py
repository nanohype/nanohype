"""MCP server factory.

Creates and configures the MCP server with all tools and resources
registered. The server is transport-agnostic -- the caller in main.py
decides how to run it.

No module-level mutable state: tool and resource registries are
scoped to the server instance returned by create_server().
"""

from mcp.server.fastmcp import FastMCP

from .config import Config
from .logger import get_logger
from .resources.example import register_example_resource
from .tools.example import register_example_tool

logger = get_logger("server")


def create_server(config: Config) -> FastMCP:
    """Create and configure the MCP server.

    All tool and resource registrations happen here. Add new tools
    by creating a file in src/tools/ and calling its registration
    function from this factory.

    Args:
        config: Application configuration.

    Returns:
        A fully configured FastMCP server instance.
    """
    server = FastMCP(
        name=config.server_name,
        version=config.server_version,
    )

    logger.info("server.create", name=config.server_name)

    # -- Tools ---------------------------------------------------------------
    # Each tool is registered via a helper function that receives the
    # server instance. Add new tools by creating a file in src/tools/
    # and calling its registration function here.
    register_example_tool(server)
    logger.info("server.tool_registered", name="greet")

    # -- Resources -----------------------------------------------------------
    # Resources expose data that MCP clients can read. Remove this section
    # if you opted out of resource examples during scaffolding.
    register_example_resource(server, config)

    return server
