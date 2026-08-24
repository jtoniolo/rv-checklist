#!/usr/bin/env bash
# PreToolUse hook for backlog worker and reviewer agents.
#
# Does two things, both mechanical:
#   1. Lease  — every tool call touches .reports/locks/<ticket>.lease. Liveness
#      is then observed rather than guessed: an agent doing work touches tools
#      constantly, and a silent lease is a genuinely stuck agent.
#   2. Mutex  — the first agent to act in a worktree claims it. A second agent
#      that finds the claim held by a live holder is stopped before it can do
#      damage. On 2026-08-24 two reviewers shared wt-144 and one deleted the
#      other's container and probe files; this makes that impossible.

set -uo pipefail
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SELF_DIR/common.sh"

INPUT="$(cat)"
CWD="$(jq -r '.cwd // empty' <<<"$INPUT" 2>/dev/null)"
AGENT="$(jq -r '.agent_id // "unknown"' <<<"$INPUT" 2>/dev/null)"

# The worktree names the ticket: .../rv-checklist-wt/wt-144
TICKET=""
if [[ "$CWD" =~ wt-([0-9]+) ]]; then
  TICKET="${BASH_REMATCH[1]}"
elif [[ "$INPUT" =~ wt-([0-9]+) ]]; then
  TICKET="${BASH_REMATCH[1]}"
fi

# No ticket in view: nothing to lease and nothing to protect.
[[ -z "$TICKET" ]] && exit 0

MUTEX="$LOCKS/$TICKET.mutex"
if [[ -f "$MUTEX" ]]; then
  HOLDER="$(cat "$MUTEX")"
  if [[ "$HOLDER" != "$AGENT" ]]; then
    HOLDER_AGE="$(age_of "$LOCKS/$TICKET.lease")"
    if (( HOLDER_AGE < LEASE_STALE_SECONDS )); then
      jq -cn --arg t "$TICKET" --arg h "$HOLDER" '{
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: ("wt-" + $t + " is held by a live agent (" + $h + ").")
        },
        systemMessage: ("Another agent is already working wt-" + $t + " and is alive. Do not touch this worktree. Stop now and report: VERDICT: aborted — duplicate agent.")
      }'
      exit 0
    fi
  fi
fi

# Claim the worktree and refresh the lease. Any tool call counts as a heartbeat.
printf '%s' "$AGENT" >"$MUTEX"
touch "$LOCKS/$TICKET.lease"
exit 0
