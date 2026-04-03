# __PROJECT_NAME__

__DESCRIPTION__

## Quick start

```bash
# Create a virtual environment
python -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -e '.[dev]'

# Copy environment config
cp .env.example .env

# Run the server
python -m src.main
```

## Adding tools

Create a new file in `src/tools/` following the pattern in `src/tools/example.py`, then register it in `src/server.py`.

## Adding resources

Create a new file in `src/resources/` following the pattern in `src/resources/example.py`, then register it in `src/server.py`.

## Development

```bash
# Run tests
pytest

# Lint
ruff check src/ tests/

# Format
black src/ tests/
```
