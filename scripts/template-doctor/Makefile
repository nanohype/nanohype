SHELL := /bin/bash
DOCTOR := ./run.sh

.PHONY: help doctor ts go java python cross markdown

help:
	@echo "Targets:"
	@echo "  doctor    Run every check group (default)"
	@echo "  ts        Run TypeScript checks only"
	@echo "  go        Run Go checks only"
	@echo "  java      Run Java checks only"
	@echo "  python    Run Python checks only"
	@echo "  cross     Run cross-cutting checks only"
	@echo "  markdown  Emit the report as markdown on stdout"
	@echo ""
	@echo "Flags via env:"
	@echo "  SKIP_TS=<names>    Skip named TS templates (comma-separated)"
	@echo "  SKIP_GO=<names>    Skip named Go templates"
	@echo "  SKIP_JAVA=<names>  Skip named Java templates"
	@echo "  SKIP_PYTHON=<names> Skip named Python templates"

doctor:
	$(DOCTOR)

ts:
	$(DOCTOR) --only ts

go:
	$(DOCTOR) --only go

java:
	$(DOCTOR) --only java

python:
	$(DOCTOR) --only python

cross:
	$(DOCTOR) --only cross

markdown:
	$(DOCTOR) --format markdown
