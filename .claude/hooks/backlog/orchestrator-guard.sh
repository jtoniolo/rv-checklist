#!/usr/bin/env bash
# PreToolUse guard for the backlog-orchestrator agent.
#
# The orchestrator's exhaustive list, made executable. Anything not named here
# is denied, and the denial tells it to dispatch a sub-agent instead.
#
# Fires only for the orchestrator's own tool calls. Sub-agent frontmatter hooks
# are not inherited by descendants, so workers, reviewers and the merger are
# untouched by this file.

set -uo pipefail
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SELF_DIR/common.sh"

INPUT="$(cat)"
TOOL="$(jq -r '.tool_name // empty' <<<"$INPUT" 2>/dev/null)"
[[ -z "$TOOL" ]] && allow   # unparseable input: fail open rather than brick a run

DISPATCH_HINT="Dispatch a sub-agent to do this. The orchestrator orchestrates and nothing else."

# ---------------------------------------------------------------- Bash --------

check_bash() {
  local cmd
  cmd="$(jq -r '.tool_input.command // empty' <<<"$INPUT")"
  [[ -z "$cmd" ]] && allow

  # No chaining except `&&`, no redirection, no substitution.
  if [[ "$cmd" =~ (\;|\||\`|\$\(|\>|\<) ]] || [[ "$cmd" =~ (^|[^\&])\&([^\&]|$) ]]; then
    deny "Denied: shell chaining, redirection and substitution are not on the orchestrator's list. $DISPATCH_HINT"
  fi

  local seg
  # shellcheck disable=SC2001
  while IFS= read -r seg || [[ -n "$seg" ]]; do
    seg="$(sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' <<<"$seg")"
    [[ -z "$seg" ]] && continue
    case "$seg" in
      cd\ *)                                        ;;  # navigate only
      export\ NX_CACHE_DIRECTORY=*)                 ;;  # wave-shared nx cache
      mkdir\ -p\ .reports*|mkdir\ .reports*)        ;;
      git\ worktree\ add\ *)                        ;;
      git\ worktree\ list*)                         ;;
      git\ log*)                                    ;;
      git\ status*)                                 ;;
      gh\ issue\ close\ *)                          ;;
      gh\ issue\ comment\ *)                        ;;
      gh\ issue\ edit\ *--add-assignee*)            ;;
      gh\ issue\ edit\ *--remove-assignee*)         ;;
      gh\ issue\ edit\ *--add-label*)               ;;
      gh\ issue\ edit\ *--remove-label*)            ;;
      pnpm\ install\ --frozen-lockfile*)            ;;
      cp\ *\.env*)                                  ;;
      *)
        deny "Denied: \`${seg}\` is not on the orchestrator's Bash allowlist. $DISPATCH_HINT"
        ;;
    esac
  done < <(tr '\n' ' ' <<<"$cmd" | sed 's/&&/\n/g')
  allow
}

# --------------------------------------------------------------- Write --------

check_write() {
  local path
  path="$(jq -r '.tool_input.file_path // empty' <<<"$INPUT")"
  [[ -z "$path" ]] && allow
  if [[ "$path" == "$ROOT/.reports/"* || "$path" == ".reports/"* ]]; then
    allow
  fi
  deny "Denied: the orchestrator writes only under .reports/. $DISPATCH_HINT"
}

# --------------------------------------------------------- SendMessage --------
# The orchestrator may wake an agent. It may not instruct one. A free-text
# channel is how its opinion reaches the work, which is what turned a review
# round into a rubber stamp on #45.

check_message() {
  local msg
  msg="$(jq -r '.tool_input.message // empty' <<<"$INPUT" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:][:punct:]')"
  case "$msg" in
    status|continue|reportnow) allow ;;
    *)
      deny "Denied: the orchestrator may send only \"status?\", \"continue\" or \"report now\". Anything else is briefing, and briefing belongs in a fresh dispatch."
      ;;
  esac
}

# --------------------------------------------------------------- Agent --------
# One live agent per ticket, enforced here rather than judged by the
# orchestrator. It proposes a dispatch; this script rules on it.

check_agent() {
  local name ticket round
  name="$(jq -r '.tool_input.name // empty' <<<"$INPUT")"

  if [[ -z "$name" ]]; then
    deny "Denied: every dispatch must be named. Ticket agents are named worker-<ticket>-r<round> or reviewer-<ticket>-r<round>; others are planner-w<n>, merger-w<n>, final-review-<n>."
  fi

  # Agents with no ticket of their own carry no lock.
  case "$name" in
    planner-*|merger-*|final-review*) allow ;;
  esac

  if [[ ! "$name" =~ ^(worker|reviewer)-([0-9]+)-r([0-9]+)$ ]]; then
    deny "Denied: \`$name\` is not a valid agent name. Use worker-<ticket>-r<round> or reviewer-<ticket>-r<round>."
  fi
  ticket="${BASH_REMATCH[2]}"
  round="${BASH_REMATCH[3]}"

  if (( round > MAX_ROUNDS )); then
    deny "Denied: #$ticket has used its $MAX_ROUNDS rounds. Hand it forward — comment the failure log, unassign, leave the worktree standing."
  fi

  local lease="$LOCKS/$ticket.lease"
  local age; age="$(age_of "$lease")"
  if (( age < LEASE_STALE_SECONDS )); then
    deny "Denied: an agent for #$ticket made a tool call ${age}s ago, so it is alive. Wait for its report, or send it \"status?\". A replacement is permitted only after ${LEASE_STALE_SECONDS}s of silence."
  fi

  # Stale or absent lease: this is a permitted replacement. Count it.
  local state="$LOCKS/$ticket.dispatch"
  local prev_round=0 count=0
  if [[ -f "$state" ]]; then
    prev_round="$(jq -r '.round // 0' "$state")"
    count="$(jq -r '.redispatches // 0' "$state")"
  fi
  if [[ "$prev_round" != "$round" ]]; then
    count=0            # a new round starts with a clean budget
  else
    count=$(( count + 1 ))
  fi
  if (( count > MAX_REDISPATCH )); then
    deny "Denied: #$ticket round $round has already been restarted $MAX_REDISPATCH times. It is not progressing. Hand it forward with its log and move on."
  fi
  jq -cn --arg r "$round" --argjson c "$count" \
    '{round: $r, redispatches: $c}' >"$state"

  # A replacement inherits the ticket; clear the old holder's worktree claim.
  rm -f "$LOCKS/$ticket.mutex"
  allow
}

case "$TOOL" in
  Bash)          check_bash ;;
  Write)         check_write ;;
  SendMessage)   check_message ;;
  Agent|Task)    check_agent ;;
  *)             allow ;;
esac
