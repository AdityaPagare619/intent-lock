# Intent Lock — Ria's lane. Targets must not lie. If one goes red, stop and read it.
# 4-service topology (D-08): :9000 chaos → :8080 mcp → :4000 orchestrator → :3000 sim.
COMPOSE := docker compose
PYTHON  := python3

.PHONY: help config dev dev-chaos demo demo-compose stop down logs test-mcp verify chaos-suite clean

help: ## what each target does (this list)
	@grep -E '^[a-z-]+: ##' $(MAKEFILE_LIST) | sed 's/: ##/ —/'

config: ## validate the 4-service compose file (works with no Docker engine)
	$(COMPOSE) config --quiet && echo "compose OK: 4 services render clean"

dev: ## boot all 4 services (foreground; Ctrl-C tears it down)
	$(COMPOSE) up --build

dev-chaos: ## boot with fault injection ARMED on both ends (D-06)
	MCP_CHAOS_MODE=1 CHAOS_MODE=chaos_injection $(COMPOSE) up --build

demo: ## THE one command: all 4 services up, no Docker, no env vars (zero-settings)
	./scripts/bootstrap.sh
	./scripts/demo-up.sh
	@echo "waiting for all 4 services…"
	@MCP_P=$${INTENT_LOCK_MCP_PORT:-8080}; CHAOS_P=$${INTENT_LOCK_CHAOS_PORT:-9000}; \
	ORCH_P=$${INTENT_LOCK_ORCH_PORT:-4000}; SIM_P=$${INTENT_LOCK_SIM_PORT:-3000}; \
	count_up() { \
	  n=0; \
	  curl -sf -m 2 -o /dev/null "http://127.0.0.1:$$MCP_P/health" 2>/dev/null && n=$$((n+1)); \
	  curl -sf -m 2 -o /dev/null "http://127.0.0.1:$$CHAOS_P/health" 2>/dev/null && n=$$((n+1)); \
	  curl -sf -m 2 -o /dev/null "http://127.0.0.1:$$ORCH_P/health" 2>/dev/null && n=$$((n+1)); \
	  curl -sf -m 2 -o /dev/null "http://127.0.0.1:$$SIM_P/" 2>/dev/null && n=$$((n+1)); \
	  echo $$n; \
	}; \
	up=0; \
	for i in $$(seq 1 30); do \
	  up=$$(count_up); \
	  if [ "$$up" -ge 4 ]; then echo "all 4 services responding"; break; fi; \
	  sleep 2; \
	done; \
	up=$$(count_up); \
	if [ "$$up" -lt 4 ]; then echo "DEMO FAILED: only $$up/4 services responding — read logs/"; exit 1; fi; \
	echo "demo stack: sim http://localhost:$$SIM_P · orchestrator :$$ORCH_P · mcp :$$MCP_P · chaos :$$CHAOS_P"
# J-01 note on the health-wait this replaced: the old probe was
#   curl … / || curl … /health && up++
# In shell, && and || are equal-precedence and LEFT-associative, so it parsed
# as (A || B) && C — the counting was accidentally right. The real bug was
# semantic: curl without -f exits 0 for ANY HTTP response (404/500 included,
# even a foreign app squatting the port), so "responding" proved only that
# something held the TCP port. The probes above hit each service's real
# /health route (sim: /) with -f, so green now means OUR services answer.

demo-compose: ## start all 4 via compose (needs a Docker engine; UNTESTED on this box)
	$(COMPOSE) up --build -d
	@echo "waiting for healthy services…"
	@for i in $$(seq 1 30); do \
	  healthy=$$($(COMPOSE) ps --format json 2>/dev/null | grep -o '"Health":"healthy"' | wc -l); \
	  if [ "$$healthy" -ge 4 ]; then echo "all 4 services healthy"; break; fi; \
	  sleep 2; \
	done
	@$(COMPOSE) ps
	@echo "demo stack: sim http://localhost:3000 · orchestrator :4000 · mcp :8080 · chaos :9000"

verify: ## 4-act MCP wire proof against the live stack (2025-11-25 handshake → tools)
	./scripts/verify_mcp_wire.sh

stop: ## stop the no-Docker demo started by `make demo` (no Docker needed)
	./scripts/demo-down.sh

down: ## [compose path] stop everything, keep the ledger volume (needs Docker)
	$(COMPOSE) down

logs: ## [compose path] tail all four services (needs Docker)
	$(COMPOSE) logs -f

test-mcp: ## Phase-2 exit test: 4-act wire proof (needs the stack up)
	./scripts/verify_mcp_wire.sh

chaos-suite: ## 10 frustration scenarios against the live stack
	$(PYTHON) demo/run_10_global_tests.py

clean: ## [compose path] stop everything AND delete the ledger volume (needs Docker; the nuclear option)
	$(COMPOSE) down -v
