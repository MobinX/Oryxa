#!/usr/bin/env bash
# ==============================================================================
# watch_action.sh - Real-Time GitHub Actions Monitor & Log Viewer
# Designed for low-spec VPS / headless CLI development.
# ==============================================================================

set -o pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

MODE="auto"
POLL_INTERVAL=5
RUN_ID=""
TAIL_LINES=50
ALL_LOGS=false
ERRORS_ONLY=false
STEP_FILTER=""
TOKEN=""
OWNER_REPO=""

WORKFLOW_FILTER="flutter_build_or_patch.yml"

# Auto-load .env if available
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  source "$ROOT_DIR/.env" 2>/dev/null || true
  set +a
fi
if [[ -f "$ROOT_DIR/../.env" ]]; then
  set -a
  source "$ROOT_DIR/../.env" 2>/dev/null || true
  set +a
fi

if [[ -n "${GITHUB_TOKEN:-}" && -z "${TOKEN:-}" ]]; then
  TOKEN="$GITHUB_TOKEN"
fi

usage() {
  cat << EOF
${BOLD}Usage:${NC} $(basename "$0") [OPTIONS]

${BOLD}Options:${NC}
  -w, --watch            Continuously watch the latest (or specified) workflow run until completion
  -l, --logs             Show job execution logs (default: last ${TAIL_LINES} lines)
  -e, --errors           Extract and show only error/failure messages from the logs
  -n, --tail <N>         Show last N lines of logs (default: 50)
  -a, --all              Print complete raw log without truncation
  -r, --runs             List the recent 10 workflow runs
  -i, --run-id <ID>      Target a specific workflow run ID instead of the latest
  -t, --token <TOKEN>    Specify GitHub Personal Access Token (defaults to GITHUB_TOKEN or origin URL)
  -h, --help             Show this help message

${BOLD}Examples:${NC}
  $(basename "$0")                  # Auto-inspect latest run (watches if in progress)
  $(basename "$0") -w               # Watch workflow progress live in terminal
  $(basename "$0") -l -n 100        # Show last 100 lines of logs from latest run
  $(basename "$0") -e               # Show only errors/failures from run log
  $(basename "$0") -r               # List recent 10 runs with statuses and IDs
  $(basename "$0") -i 42761029070 -e# Inspect errors from specific run ID
EOF
  exit 0
}

# Parse command line options
while [[ $# -gt 0 ]]; do
  case "$1" in
    -w|--watch)
      MODE="watch"
      shift
      ;;
    -l|--logs)
      MODE="logs"
      shift
      ;;
    -e|--errors)
      ERRORS_ONLY=true
      MODE="logs"
      shift
      ;;
    -n|--tail)
      TAIL_LINES="$2"
      MODE="logs"
      shift 2
      ;;
    -a|--all)
      ALL_LOGS=true
      MODE="logs"
      shift
      ;;
    -s|--step)
      STEP_FILTER="$2"
      shift 2
      ;;
    -r|--runs)
      MODE="runs"
      shift
      ;;
    -i|--run-id)
      RUN_ID="$2"
      shift 2
      ;;
    -t|--token)
      TOKEN="$2"
      shift 2
      ;;
    -h|--help)
      usage
      ;;
    *)
      echo -e "${RED}Unknown argument: $1${NC}"
      usage
      ;;
  esac
done

# Auto-detect Owner/Repo and Token
detect_git_config() {
  local origin_url
  origin_url=$(git remote get-url origin 2>/dev/null || echo "")

  if [[ -z "$TOKEN" ]]; then
    if [[ -n "$GITHUB_TOKEN" ]]; then
      TOKEN="$GITHUB_TOKEN"
    elif [[ -n "$GH_TOKEN" ]]; then
      TOKEN="$GH_TOKEN"
    elif [[ "$origin_url" =~ https://([^:]+):([^@]+)@github\.com ]]; then
      TOKEN="${BASH_REMATCH[2]}"
    fi
  fi

  if [[ -z "$OWNER_REPO" ]]; then
    if [[ -n "${GITHUB_OWNER:-}" && -n "${GITHUB_REPO:-}" ]]; then
      OWNER_REPO="${GITHUB_OWNER}/${GITHUB_REPO}"
    elif [[ "$origin_url" =~ github\.com[:/]([^/]+)/([^/\.]+) ]]; then
      OWNER_REPO="${BASH_REMATCH[1]}/${BASH_REMATCH[2]}"
    fi
  fi

  if [[ -z "$OWNER_REPO" ]]; then
    echo -e "${RED}Error: Could not determine GitHub repository from git remote.${NC}"
    echo "Make sure you are in a git repository with an origin pointing to GitHub."
    exit 1
  fi
}

detect_git_config

API_HEADER="Accept: application/vnd.github.v3+json"
AUTH_HEADER=()
if [[ -n "$TOKEN" ]]; then
  AUTH_HEADER=(-H "Authorization: Bearer $TOKEN")
fi

call_github_api() {
  local endpoint="$1"
  local url="https://api.github.com/repos/${OWNER_REPO}/${endpoint}"
  curl -s "${AUTH_HEADER[@]}" -H "$API_HEADER" "$url"
}

# ------------------------------------------------------------------------------
# Action: List Recent Runs
# ------------------------------------------------------------------------------
list_runs() {
  echo -e "${BOLD}${CYAN}=== Recent GitHub Action Runs for ${OWNER_REPO} ===${NC}\n"
  local json
  if [[ -n "$WORKFLOW_FILTER" ]]; then
    json=$(call_github_api "actions/workflows/${WORKFLOW_FILTER}/runs?per_page=10")
  fi
  local total_count
  total_count=$(echo "$json" | jq -r '.total_count // 0' 2>/dev/null || echo "0")
  if [[ "$total_count" -eq 0 ]]; then
    json=$(call_github_api "actions/runs?per_page=10")
  fi

  total_count=$(echo "$json" | jq -r '.total_count // 0' 2>/dev/null || echo "0")
  if [[ "$total_count" -eq 0 ]]; then
    echo -e "${YELLOW}No workflow runs found.${NC}"
    exit 0
  fi

  printf "%-14s %-12s %-12s %-20s %s\n" "RUN ID" "STATUS" "CONCLUSION" "TRIGGERED AT" "COMMIT MESSAGE"
  echo "------------------------------------------------------------------------------------------------------------"

  echo "$json" | jq -r '.workflow_runs[] | [
    (.id | tostring),
    .status,
    (.conclusion // "running"),
    (.created_at | split(".")[0] | sub("T"; " ")),
    (.head_commit.message // "No message" | split("\n")[0] | .[0:50])
  ] | @tsv' | while IFS=$'\t' read -r id status conclusion created_at message; do
    local icon="⏳"
    local color="$YELLOW"
    if [[ "$conclusion" == "success" ]]; then
      icon="✅"
      color="$GREEN"
    elif [[ "$conclusion" == "failure" ]]; then
      icon="❌"
      color="$RED"
    elif [[ "$conclusion" == "cancelled" ]]; then
      icon="⚠️"
      color="$YELLOW"
    elif [[ "$conclusion" == "skipped" ]]; then
      icon="⏩"
      color="$BLUE"
    fi

    printf "${BOLD}%-14s${NC} %-12s ${color}%-2s %-10s${NC} %-20s %s\n" \
      "$id" "$status" "$icon" "$conclusion" "$created_at" "$message"
  done
  echo ""
}

# ------------------------------------------------------------------------------
# Fetch Run Metadata
# ------------------------------------------------------------------------------
init_run_id() {
  if [[ -z "$RUN_ID" ]]; then
    local latest_run_json
    if [[ -n "$WORKFLOW_FILTER" ]]; then
      latest_run_json=$(call_github_api "actions/workflows/${WORKFLOW_FILTER}/runs?per_page=1")
      RUN_ID=$(echo "$latest_run_json" | jq -r '.workflow_runs[0].id // empty' 2>/dev/null)
    fi

    if [[ -z "$RUN_ID" ]]; then
      latest_run_json=$(call_github_api "actions/runs?per_page=1")
      RUN_ID=$(echo "$latest_run_json" | jq -r '.workflow_runs[0].id // empty' 2>/dev/null)
    fi

    if [[ -z "$RUN_ID" ]]; then
      echo -e "${RED}Error: No workflow runs found for ${OWNER_REPO}.${NC}"
      exit 1
    fi
  fi
}

get_run_data() {
  init_run_id
  call_github_api "actions/runs/${RUN_ID}"
}

# ------------------------------------------------------------------------------
# Fetch Run Jobs
# ------------------------------------------------------------------------------
get_jobs_data() {
  init_run_id
  call_github_api "actions/runs/${RUN_ID}/jobs"
}

# ------------------------------------------------------------------------------
# Action: Stream Logs
# ------------------------------------------------------------------------------
show_logs() {
  local jobs_json
  jobs_json=$(get_jobs_data)

  local job_id
  job_id=$(echo "$jobs_json" | jq -r '.jobs[0].id // empty' 2>/dev/null)

  if [[ -z "$job_id" ]]; then
    echo -e "${YELLOW}No jobs found for run ID ${RUN_ID}.${NC}"
    exit 0
  fi

  local job_name
  job_name=$(echo "$jobs_json" | jq -r '.jobs[0].name // "Job"' 2>/dev/null)

  echo -e "${CYAN}${BOLD}=== Logs for Job: ${job_name} (Run ID: ${RUN_ID}) ===${NC}\n"

  local log_url="https://api.github.com/repos/${OWNER_REPO}/actions/jobs/${job_id}/logs"
  
  if [[ "$ERRORS_ONLY" = true ]]; then
    echo -e "${RED}${BOLD}(Extracting error & failure diagnostics)${NC}\n"
    local raw_errors
    raw_errors=$(curl -s -L "${AUTH_HEADER[@]}" "$log_url" | grep -E -C 3 "(##\[error\]|FAILURE:|error:|BUILD FAILED|Execution failed)" || true)
    if [[ -n "$raw_errors" ]]; then
      echo "$raw_errors"
    else
      echo -e "${GREEN}No explicit error patterns detected in logs.${NC}"
    fi
  elif [[ "$ALL_LOGS" = true ]]; then
    curl -s -L "${AUTH_HEADER[@]}" "$log_url"
  else
    echo -e "${YELLOW}(Displaying last ${TAIL_LINES} lines. Use -a for all logs or -e for errors)${NC}\n"
    curl -s -L "${AUTH_HEADER[@]}" "$log_url" | tail -n "${TAIL_LINES}"
  fi
}

# ------------------------------------------------------------------------------
# Display Steps Status
# ------------------------------------------------------------------------------
print_steps_table() {
  local jobs_json="$1"
  local run_data="$2"

  local run_status
  local run_conclusion
  local commit_msg
  local run_url

  run_status=$(echo "$run_data" | jq -r '.status // "unknown"')
  run_conclusion=$(echo "$run_data" | jq -r '.conclusion // "running"')
  commit_msg=$(echo "$run_data" | jq -r '.head_commit.message // "No message"' | head -n 1)
  run_url=$(echo "$run_data" | jq -r '.html_url // ""')

  echo -e "${BOLD}Run ID:${NC} ${CYAN}${RUN_ID}${NC}"
  echo -e "${BOLD}Commit:${NC} ${commit_msg}"
  echo -e "${BOLD}Status:${NC} ${run_status} | ${BOLD}Conclusion:${NC} ${run_conclusion}"
  echo -e "${BOLD}URL:${NC}    ${run_url}"
  echo -e "--------------------------------------------------------------------------------"

  printf "%-4s %-2s %-45s %-12s %-10s\n" "#" "  " "STEP NAME" "STATUS" "RESULT"
  echo "--------------------------------------------------------------------------------"

  echo "$jobs_json" | jq -r '.jobs[0].steps[]? | [
    (.number | tostring),
    .name,
    .status,
    (.conclusion // "running")
  ] | @tsv' | while IFS=$'\t' read -r number name status conclusion; do
    local icon="⏳"
    local color="$YELLOW"
    if [[ "$conclusion" == "success" ]]; then
      icon="✅"
      color="$GREEN"
    elif [[ "$conclusion" == "failure" ]]; then
      icon="❌"
      color="$RED"
    elif [[ "$conclusion" == "skipped" ]]; then
      icon="⏩"
      color="$BLUE"
    elif [[ "$status" == "in_progress" ]]; then
      icon="🔄"
      color="$YELLOW"
    fi

    printf "%-4s %-2s %-45s %-12s ${color}%-10s${NC}\n" \
      "$number" "$icon" "${name:0:45}" "$status" "$conclusion"
  done
  echo "--------------------------------------------------------------------------------"
}

# ------------------------------------------------------------------------------
# Action: Watch / Monitor
# ------------------------------------------------------------------------------
watch_run() {
  echo -e "${CYAN}${BOLD}Watching GitHub Actions Run ID: ${RUN_ID}... (Press Ctrl+C to stop)${NC}\n"

  while true; do
    local run_data
    run_data=$(call_github_api "actions/runs/${RUN_ID}")
    local status
    local conclusion
    status=$(echo "$run_data" | jq -r '.status // "unknown"')
    conclusion=$(echo "$run_data" | jq -r '.conclusion // "running"')

    local jobs_json
    jobs_json=$(get_jobs_data)

    # Clear screen if in terminal interactive mode with valid TERM
    if [[ -t 1 && -n "${TERM:-}" && "${TERM}" != "dumb" ]]; then
      clear 2>/dev/null || true
    fi

    echo -e "${BOLD}${CYAN}=== GitHub Actions Live Monitor ===${NC} ($(date '+%Y-%m-%d %H:%M:%S'))"
    print_steps_table "$jobs_json" "$run_data"

    if [[ "$status" == "completed" ]]; then
      echo ""
      if [[ "$conclusion" == "success" ]]; then
        echo -e "${GREEN}${BOLD}🎉 Workflow Run Succeeded!${NC}"
      elif [[ "$conclusion" == "failure" ]]; then
        echo -e "${RED}${BOLD}❌ Workflow Run Failed! Displaying recent error logs:${NC}\n"
        show_logs
      else
        echo -e "${YELLOW}${BOLD}Workflow completed with status: ${conclusion}${NC}"
      fi
      break
    fi

    sleep "$POLL_INTERVAL"
  done
}

# ------------------------------------------------------------------------------
# Main Dispatch
# ------------------------------------------------------------------------------
case "$MODE" in
  runs)
    list_runs
    ;;
  logs)
    init_run_id
    show_logs
    ;;
  watch)
    init_run_id
    watch_run
    ;;
  auto)
    init_run_id
    run_data=$(get_run_data)
    status=$(echo "$run_data" | jq -r '.status // "unknown"')
    if [[ "$status" == "in_progress" || "$status" == "queued" ]]; then
      watch_run
    else
      jobs_json=$(get_jobs_data)
      echo -e "${BOLD}${CYAN}=== Latest GitHub Action Run Status ===${NC}\n"
      print_steps_table "$jobs_json" "$run_data"
      echo -e "\n${BOLD}Options:${NC}"
      echo -e "  To see logs:         ${CYAN}$0 --logs --tail 100${NC}"
      echo -e "  To see all runs:     ${CYAN}$0 --runs${NC}"
      echo -e "  To watch active run: ${CYAN}$0 --watch${NC}"
    fi
    ;;
esac
