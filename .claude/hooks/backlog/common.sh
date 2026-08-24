#!/usr/bin/env bash
# Shared helpers for the work-backlog orchestrator guards.
# Sourced, never executed directly.

ROOT="${CLAUDE_PROJECT_DIR:-$PWD}"
LOCKS="$ROOT/.reports/locks"
RELAY="$ROOT/.reports/relay"

# How long an agent may make no tool call before a replacement is allowed.
LEASE_STALE_SECONDS=900   # 15 minutes
# Replacements allowed within one round before the ticket is handed forward.
MAX_REDISPATCH=3
# Rounds one ticket may take before it is handed forward.
MAX_ROUNDS=5

mkdir -p "$LOCKS" "$RELAY" 2>/dev/null

deny() {
  local reason="$1"
  jq -cn --arg r "$reason" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $r
    },
    systemMessage: $r
  }'
  exit 0
}

allow() { exit 0; }

# Seconds since a file was last touched. Prints a huge number if absent.
age_of() {
  local f="$1"
  if [[ -f "$f" ]]; then
    echo $(( $(date +%s) - $(stat -c %Y "$f") ))
  else
    echo 999999999
  fi
}
