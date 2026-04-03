"""Application configuration via environment variables.

Uses Pydantic BaseSettings for typed, validated configuration with
automatic environment variable loading. All settings have sensible
defaults for local development.
"""

from pydantic_settings import BaseSettings


class Config(BaseSettings):
    """Server configuration loaded from environment variables."""

    model_config = {"env_prefix": "", "case_sensitive": False}

    # Server
    port: int = 8000
    host: str = "0.0.0.0"

    # Logging
    log_level: str = "info"

    # Application
    server_name: str = "mcp-server"
    server_version: str = "0.1.0"
