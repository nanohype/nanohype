"""Structured JSON logger using structlog.

Configures structlog for JSON output with timestamps, log levels,
and key-value context. Writes to stderr to avoid corrupting MCP
protocol messages on stdout (required for stdio transport).
"""

import logging
import sys

import structlog


def configure_logging(log_level: str = "info") -> None:
    """Configure structlog for JSON output to stderr.

    Args:
        log_level: Minimum log level (debug, info, warning, error).
    """
    numeric_level = getattr(logging, log_level.upper(), logging.INFO)

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(numeric_level),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(file=sys.stderr),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    """Get a bound logger instance.

    Args:
        name: Optional logger name for context.

    Returns:
        A bound structlog logger.
    """
    logger = structlog.get_logger()
    if name:
        logger = logger.bind(logger_name=name)
    return logger
