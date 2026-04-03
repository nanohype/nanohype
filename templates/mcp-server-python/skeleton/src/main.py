"""Entry point for the MCP server.

Creates the server via the factory function and starts it using the
configured transport. Transport selection is handled at scaffolding
time via the __TRANSPORT__ placeholder in the import path.
"""

import signal
import sys

from .config import Config
from .logger import configure_logging, get_logger
from .server import create_server
from .transports.__TRANSPORT__ import start

logger = get_logger("main")


def _handle_shutdown(signum: int, _frame: object) -> None:
    """Handle graceful shutdown on SIGINT/SIGTERM."""
    sig_name = signal.Signals(signum).name
    logger.info("server.shutdown", signal=sig_name)
    sys.exit(0)


def main() -> None:
    """Initialize configuration, logging, and start the server."""
    config = Config()
    configure_logging(config.log_level)

    signal.signal(signal.SIGINT, _handle_shutdown)
    signal.signal(signal.SIGTERM, _handle_shutdown)

    logger.info("server.init", transport="__TRANSPORT__")

    server = create_server(config)
    start(server)


if __name__ == "__main__":
    main()
