.DEFAULT_GOAL := help

# Accept RECIPE=<name> from the command line. Defaults to the recipe that
# covers the most current validations; add more under recipes/<name>/ and
# they're automatically discovered by the `help` and `recipes` targets.
RECIPE ?= istio

MAKEFILE_PATH := $(lastword $(MAKEFILE_LIST))
HARNESS_DIR   := $(dir $(MAKEFILE_PATH))
RECIPE_DIR    := $(HARNESS_DIR)recipes/$(RECIPE)
LIB_DIR       := $(HARNESS_DIR)lib

.PHONY: up
up: ## Bring up a local cluster for the recipe (RECIPE=<name>)
	@test -d "$(RECIPE_DIR)" || { echo "unknown recipe: $(RECIPE)"; $(MAKE) --no-print-directory recipes; exit 1; }
	@bash "$(RECIPE_DIR)/up.sh"

.PHONY: down
down: ## Tear down the recipe's cluster (RECIPE=<name>)
	@test -d "$(RECIPE_DIR)" || { echo "unknown recipe: $(RECIPE)"; exit 1; }
	@bash "$(RECIPE_DIR)/down.sh"

.PHONY: status
status: ## Print cluster state for the recipe (RECIPE=<name>)
	@test -d "$(RECIPE_DIR)" || { echo "unknown recipe: $(RECIPE)"; exit 1; }
	@bash "$(RECIPE_DIR)/status.sh"

.PHONY: validate
validate: ## Dry-run apply a rendered manifest tree (DIR=<path> [RECIPE=<name>])
	@test -n "$(DIR)" || { echo "DIR=<path> required"; exit 1; }
	@test -d "$(DIR)" || { echo "not a directory: $(DIR)"; exit 1; }
	@bash "$(LIB_DIR)/validate.sh" "$(DIR)" "$(RECIPE)"

.PHONY: verify
verify: ## Render + run all declared checks for a template or composite (TEMPLATE=<name> | COMPOSITE=<name> [RECIPE=<name>] [FORMAT=text|json])
	@if [ -n "$(TEMPLATE)" ]; then \
		bash "$(LIB_DIR)/verify.sh" template "$(TEMPLATE)" $(if $(RECIPE),--recipe $(RECIPE)) $(if $(filter json,$(FORMAT)),--json); \
	elif [ -n "$(COMPOSITE)" ]; then \
		bash "$(LIB_DIR)/verify.sh" composite "$(COMPOSITE)" $(if $(RECIPE),--recipe $(RECIPE)) $(if $(filter json,$(FORMAT)),--json); \
	else \
		echo "TEMPLATE=<name> or COMPOSITE=<name> required"; \
		exit 1; \
	fi

.PHONY: verify-all
verify-all: ## Run verify against every template + composite that has declared defaults (quick smoke-test; relies on whichever clusters are already up)
	@errors=0; \
	for name in spring-boot-service module-spring-security istio-policy; do \
		echo ""; \
		$(MAKE) --no-print-directory verify TEMPLATE=$$name || errors=$$((errors + 1)); \
	done; \
	for name in spring-boot-microservice identity-aware-service; do \
		echo ""; \
		$(MAKE) --no-print-directory verify COMPOSITE=$$name || errors=$$((errors + 1)); \
	done; \
	echo ""; \
	if [ "$$errors" -eq 0 ]; then \
		echo "verify-all: all checks passed"; \
	else \
		echo "verify-all: $$errors target(s) had failures"; \
		exit 1; \
	fi

.PHONY: recipes
recipes: ## List available recipes
	@echo "Available recipes:"
	@for d in $(HARNESS_DIR)recipes/*/; do \
		name=$$(basename "$$d"); \
		desc=$$(head -1 "$$d/README.md" 2>/dev/null | sed 's/^# *//' | sed 's/^[a-z-]* — *//'); \
		printf "  %-12s  %s\n" "$$name" "$$desc"; \
	done

.PHONY: help
help: ## Show this help
	@echo "Local cluster harness for nanohype template validation"
	@echo ""
	@echo "Cluster lifecycle:"
	@echo "  make up RECIPE=<name>            Bring up the recipe's cluster"
	@echo "  make status RECIPE=<name>        Inspect cluster state"
	@echo "  make down RECIPE=<name>          Tear down"
	@echo ""
	@echo "Validation:"
	@echo "  make verify TEMPLATE=<name>      Render + run all declared checks for a template"
	@echo "  make verify COMPOSITE=<name>     Same for a composite"
	@echo "  make verify-all                  Smoke-test everything with declared defaults"
	@echo "  make validate DIR=<path>         Low-level: dry-run apply a rendered manifest tree"
	@echo ""
	@echo "Inspection:"
	@echo "  make recipes                     List available recipes"
	@echo "  make help                        Show this help"
	@echo ""
	@$(MAKE) --no-print-directory recipes
	@echo ""
	@echo "Examples:"
	@echo "  make up RECIPE=istio"
	@echo "  make verify COMPOSITE=identity-aware-service"
	@echo "  make verify TEMPLATE=spring-boot-service FORMAT=json"
	@echo ""
	@echo "CI: every target is non-interactive and returns a meaningful exit"
	@echo "    code. Set CI=1 to suppress color. Use FORMAT=json with verify"
	@echo "    for machine-consumable output."
