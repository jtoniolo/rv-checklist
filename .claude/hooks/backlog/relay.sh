#!/usr/bin/env bash
# PostToolUse hook on the Agent tool, for the backlog-orchestrator only.
#
# The orchestrator is the one long-lived context in a run of ~120 sub-agent
# round-trips. Relaying is on its permitted list, so a rambling sub-agent can
# flood it while breaking no rule. This intercepts every return before it lands:
# the full text goes to a file, and the orchestrator receives the fixed schema
# lines and nothing else.

set -uo pipefail
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SELF_DIR/common.sh"

MAX_LINES=40

INPUT="$(cat)"
NAME="$(jq -r '.tool_input.name // "agent"' <<<"$INPUT" 2>/dev/null)"

# The response may be a plain string or a list of content blocks.
FULL="$(jq -r '
  .tool_response
  | if type == "string" then .
    elif type == "array" then (map(.text? // "") | join("\n"))
    elif type == "object" then (.content? // .text? // . | tostring)
    else tostring end
' <<<"$INPUT" 2>/dev/null)"

[[ -z "$FULL" ]] && exit 0

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$RELAY/$NAME-$STAMP.md"
printf '%s\n' "$FULL" >"$OUT"

# Keep only the schema lines the roles are required to return.
SCHEMA="$(grep -E '^[[:space:]]*(TICKET|TICKETS|WAVE|BRANCH|VERDICT|ROUND|MERGED|SHIPPED|FILED|QUESTION|DETAIL|NOTE|BRIEF):' <<<"$FULL" | head -n "$MAX_LINES")"

if [[ -z "$SCHEMA" ]]; then
  SCHEMA="VERDICT: unparseable — the agent did not return the schema
NOTE: treat as no report; do not act on it"
fi

RELAYED="$SCHEMA
DETAIL-FILE: $OUT"

jq -cn --arg t "$RELAYED" '{
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    updatedToolOutput: $t
  }
}'
exit 0
