"""Example tool demonstrating the MCP tool pattern.

This demonstrates the standard pattern for defining a tool:

  1. Define a Pydantic model for input validation
  2. Create a registration function that receives the server
  3. Use the @server.tool() decorator for registration
  4. Return structured content from the handler

To add your own tool, copy this file, change the model/handler,
and register it in src/server.py.
"""

from enum import Enum

from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel, Field

from ..logger import get_logger

logger = get_logger("tools.greet")


class Enthusiasm(str, Enum):
    """How enthusiastic the greeting should be."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class GreetInput(BaseModel):
    """Input schema for the greet tool."""

    name: str = Field(
        ...,
        min_length=1,
        description="The name of the person to greet",
    )
    enthusiasm: Enthusiasm = Field(
        default=Enthusiasm.MEDIUM,
        description="How enthusiastic the greeting should be",
    )


def format_greeting(name: str, enthusiasm: Enthusiasm) -> str:
    """Format a greeting with the appropriate level of enthusiasm."""
    match enthusiasm:
        case Enthusiasm.LOW:
            return f"Hello, {name}."
        case Enthusiasm.MEDIUM:
            return f"Hello, {name}! Welcome to __PROJECT_NAME__."
        case Enthusiasm.HIGH:
            return f"HELLO, {name}!!! SO GREAT to have you here at __PROJECT_NAME__!!!"


def register_example_tool(server: FastMCP) -> None:
    """Register the greet example tool with the MCP server.

    Args:
        server: The FastMCP server instance to register on.
    """

    @server.tool(
        name="greet",
        description=(
            "Generate a greeting message for a given name. "
            "Use this when the user wants to say hello to someone."
        ),
    )
    def greet(name: str, enthusiasm: str = "medium") -> str:
        """Generate a greeting message.

        Args:
            name: The name of the person to greet.
            enthusiasm: How enthusiastic the greeting should be (low, medium, high).
        """
        logger.debug("tool.execute", tool="greet", name=name, enthusiasm=enthusiasm)
        try:
            validated = GreetInput(name=name, enthusiasm=Enthusiasm(enthusiasm))
            return format_greeting(validated.name, validated.enthusiasm)
        except Exception as exc:
            logger.error("tool.error", tool="greet", error=str(exc))
            return f"Error: {exc}"
