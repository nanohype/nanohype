"""Shared test fixtures for MCP server tests."""

import pytest

from src.config import Config
from src.server import create_server


@pytest.fixture
def config() -> Config:
    """Provide a test configuration."""
    return Config(
        server_name="test-server",
        server_version="0.0.1",
        log_level="debug",
    )


@pytest.fixture
def server(config: Config):
    """Provide a configured MCP server instance."""
    return create_server(config)
