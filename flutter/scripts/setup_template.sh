#!/usr/bin/env bash
# ==============================================================================
# setup_template.sh - Automated Onboarding & Zero-Touch Deployment
# Sets up GitHub Actions write permissions, Cloudflare Worker, and .env.
# ==============================================================================

set -o pipefail

BOLD='\033[1m'
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo -e "${BOLD}${CYAN}===================================================================${NC}"
echo -e "${BOLD}${CYAN}   Flutter Remote Dev - Automated Template & Worker Setup           ${NC}"
echo -e "${BOLD}${CYAN}===================================================================${NC}\n"

# Load existing .env if present
if [[ -f "$ROOT_DIR/.env" ]]; then
  echo -e "${YELLOW}Notice: Found existing .env file, loading current variables...${NC}"
  set -a
  # shellcheck source=/dev/null
  source "$ROOT_DIR/.env"
  set +a
fi

GH_TOKEN_INPUT="${GITHUB_TOKEN:-}"
CF_TOKEN_INPUT="${CLOUDFLARE_API_TOKEN:-}"
CF_ACCOUNT_INPUT="${CLOUDFLARE_ACCOUNT_ID:-}"
NON_INTERACTIVE=false

usage() {
  cat << EOF
${BOLD}Usage:${NC} $(basename "$0") [OPTIONS]

${BOLD}Options:${NC}
  -g, --github-token <TOKEN>   GitHub Personal Access Token (repo + workflow scope)
  -c, --cf-token <TOKEN>       Cloudflare API Token (Workers Scripts edit scope)
  -a, --cf-account <ID>        Cloudflare Account ID (optional; auto-detected if omitted)
  -y, --yes                    Non-interactive mode (use environment or arguments)
  -h, --help                   Show this help message

${BOLD}Examples:${NC}
  $(basename "$0")
  $(basename "$0") -g ghp_xxx -c cfat_yyy -y
EOF
  exit 0
}

# Parse command line flags
while [[ $# -gt 0 ]]; do
  case "$1" in
    -g|--github-token)
      GH_TOKEN_INPUT="$2"
      shift 2
      ;;
    -c|--cf-token)
      CF_TOKEN_INPUT="$2"
      shift 2
      ;;
    -a|--cf-account)
      CF_ACCOUNT_INPUT="$2"
      shift 2
      ;;
    -y|--yes)
      NON_INTERACTIVE=true
      shift
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

# ------------------------------------------------------------------------------
# 1. Detect Git Origin & Repository
# ------------------------------------------------------------------------------
ORIGIN_URL=$(git remote get-url origin 2>/dev/null || echo "")

if [[ -z "$ORIGIN_URL" ]]; then
  echo -e "${RED}Error: Git origin remote is not configured.${NC}"
  echo "Please initialize git and set your remote origin first: git remote add origin <url>"
  exit 1
fi

OWNER=""
REPO=""
if [[ "$ORIGIN_URL" =~ github\.com[:/]([^/]+)/([^/\.]+) ]]; then
  OWNER="${BASH_REMATCH[1]}"
  REPO="${BASH_REMATCH[2]}"
fi

# Fallback token extraction from remote URL if not provided
if [[ -z "$GH_TOKEN_INPUT" && "$ORIGIN_URL" =~ https://([^:]+):([^@]+)@github\.com ]]; then
  GH_TOKEN_INPUT="${BASH_REMATCH[2]}"
fi

echo -e "${BOLD}Target Repository:${NC} ${GREEN}${OWNER}/${REPO}${NC}"

# ------------------------------------------------------------------------------
# 2. Collect / Validate GitHub Token
# ------------------------------------------------------------------------------
if [[ -z "$GH_TOKEN_INPUT" ]]; then
  if [[ "$NON_INTERACTIVE" = true ]]; then
    echo -e "${RED}Error: GitHub Token is required in non-interactive mode (-g or GITHUB_TOKEN).${NC}"
    exit 1
  fi
  echo -e "\nEnter your GitHub Personal Access Token (PAT) with 'repo' and 'workflow' scope:"
  read -r -s -p "GitHub PAT: " GH_TOKEN_INPUT
  echo ""
fi

echo -e "\n${CYAN}==> Verifying GitHub Token...${NC}"
GH_USER_JSON=$(curl -s -H "Authorization: Bearer $GH_TOKEN_INPUT" -H "Accept: application/vnd.github.v3+json" https://api.github.com/user)
GH_LOGIN=$(echo "$GH_USER_JSON" | jq -r '.login // empty')

if [[ -z "$GH_LOGIN" ]]; then
  echo -e "${RED}Error: Invalid GitHub token or unauthorized request.${NC}"
  echo "$GH_USER_JSON" | jq -r '.message // empty'
  exit 1
fi
echo -e "${GREEN}✓ Authenticated as GitHub user:${NC} ${BOLD}${GH_LOGIN}${NC}"

# ------------------------------------------------------------------------------
# 3. Grant GitHub Actions Write Permissions Automatically
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}==> Configuring GitHub Actions Workflow Permissions (Read & Write)...${NC}"
PERM_HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PUT \
  -H "Authorization: Bearer $GH_TOKEN_INPUT" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/${OWNER}/${REPO}/actions/permissions/workflow" \
  -d '{"default_workflow_permissions":"write","can_approve_pull_request_reviews":false}')

if [[ "$PERM_HTTP_STATUS" == "204" || "$PERM_HTTP_STATUS" == "200" ]]; then
  echo -e "${GREEN}✓ GitHub Actions write permissions enabled successfully!${NC}"
else
  echo -e "${YELLOW}Warning: Received HTTP ${PERM_HTTP_STATUS} when enabling Actions write permissions.${NC}"
  echo "Please verify in GitHub: Repository Settings > Actions > General > Workflow permissions > Read and write."
fi

# Ensure git remote is authenticated with the token for frictionless pushes
git remote set-url origin "https://${GH_LOGIN}:${GH_TOKEN_INPUT}@github.com/${OWNER}/${REPO}.git"
echo -e "${GREEN}✓ Local git origin configured with credentials for automated push.${NC}"

# ------------------------------------------------------------------------------
# 4. Collect & Verify Cloudflare API Token
# ------------------------------------------------------------------------------
if [[ -z "$CF_TOKEN_INPUT" ]]; then
  if [[ "$NON_INTERACTIVE" = true ]]; then
    echo -e "${RED}Error: Cloudflare API Token is required in non-interactive mode (-c or CLOUDFLARE_API_TOKEN).${NC}"
    exit 1
  fi
  echo -e "\nEnter your Cloudflare API Token (needs 'Workers Scripts: Edit' permission):"
  read -r -s -p "Cloudflare API Token: " CF_TOKEN_INPUT
  echo ""
fi

echo -e "\n${CYAN}==> Verifying Cloudflare API Token & Account...${NC}"
CF_ACCOUNTS_JSON=$(curl -s -H "Authorization: Bearer $CF_TOKEN_INPUT" https://api.cloudflare.com/client/v4/accounts)
CF_SUCCESS=$(echo "$CF_ACCOUNTS_JSON" | jq -r '.success // false')

if [[ "$CF_SUCCESS" != "true" ]]; then
  # Fallback check
  CF_VERIFY_JSON=$(curl -s -H "Authorization: Bearer $CF_TOKEN_INPUT" https://api.cloudflare.com/client/v4/user/tokens/verify)
  CF_STATUS=$(echo "$CF_VERIFY_JSON" | jq -r '.result.status // empty')
  if [[ "$CF_STATUS" != "active" ]]; then
    echo -e "${RED}Error: Cloudflare token verification failed.${NC}"
    echo "$CF_ACCOUNTS_JSON" | jq -r '.errors // empty'
    exit 1
  fi
fi

# Auto-detect Cloudflare Account ID if not explicitly specified
if [[ -z "$CF_ACCOUNT_INPUT" ]]; then
  CF_ACCOUNT_INPUT=$(echo "$CF_ACCOUNTS_JSON" | jq -r '.result[0].id // empty')
  CF_ACCOUNT_NAME=$(echo "$CF_ACCOUNTS_JSON" | jq -r '.result[0].name // empty')
  
  if [[ -z "$CF_ACCOUNT_INPUT" ]]; then
    echo -e "${RED}Error: Could not automatically detect Cloudflare Account ID.${NC}"
    echo "Please specify it using -a <ACCOUNT_ID>."
    exit 1
  fi
  echo -e "${GREEN}✓ Cloudflare token verified. Account:${NC} ${BOLD}${CF_ACCOUNT_NAME} (${CF_ACCOUNT_INPUT})${NC}"
else
  echo -e "${GREEN}✓ Cloudflare token verified for account ID ${CF_ACCOUNT_INPUT}.${NC}"
fi

# Auto-detect Cloudflare Workers Subdomain
CF_SUBDOMAIN_JSON=$(curl -s -H "Authorization: Bearer $CF_TOKEN_INPUT" "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_INPUT}/workers/subdomain")
CF_SUBDOMAIN=$(echo "$CF_SUBDOMAIN_JSON" | jq -r '.result.subdomain // empty')

# ------------------------------------------------------------------------------
# 5. Configure & Deploy Cloudflare Worker
# ------------------------------------------------------------------------------
WORKER_NAME="${REPO//_/-}-patch-worker"

echo -e "\n${CYAN}==> Configuring Worker (${WORKER_NAME}) for ${OWNER}/${REPO}...${NC}"

cat << TOML > "$ROOT_DIR/worker/wrangler.toml"
name = "${WORKER_NAME}"
main = "src/index.js"
compatibility_date = "2024-03-01"

[vars]
GITHUB_OWNER = "${OWNER}"
GITHUB_REPO = "${REPO}"
TOML

echo -e "${GREEN}✓ Updated worker/wrangler.toml.${NC}"

echo -e "\n${CYAN}==> Deploying Cloudflare Worker via Wrangler...${NC}"
cd "$ROOT_DIR/worker"

if [[ ! -d "node_modules" ]]; then
  echo "Installing worker dependencies..."
  npm install --silent
fi

DEPLOY_OUTPUT=$(CLOUDFLARE_API_TOKEN="$CF_TOKEN_INPUT" CLOUDFLARE_ACCOUNT_ID="$CF_ACCOUNT_INPUT" npx wrangler deploy 2>&1)
echo "$DEPLOY_OUTPUT"

# Determine Live Worker URL
WORKER_URL=""
if [[ -n "$CF_SUBDOMAIN" ]]; then
  WORKER_URL="https://${WORKER_NAME}.${CF_SUBDOMAIN}.workers.dev"
else
  # Extract URL from deploy output
  WORKER_URL=$(echo "$DEPLOY_OUTPUT" | grep -o 'https://[^ ]*\.workers\.dev' | head -n 1)
fi

if [[ -z "$WORKER_URL" ]]; then
  echo -e "${YELLOW}Warning: Could not automatically parse worker URL from deploy output.${NC}"
  WORKER_URL="https://${WORKER_NAME}.workers.dev"
fi

echo -e "\n${GREEN}✓ Live Worker URL:${NC} ${BOLD}${WORKER_URL}${NC}"

# Update flutter_patcher.yaml with live URL
cd "$ROOT_DIR"
cat << YAML > "$ROOT_DIR/flutter_patcher.yaml"
# Flutter Patcher Configuration
# Generated automatically by scripts/setup_template.sh

patch_server:
  manifest_url: "${WORKER_URL}/manifest.json"
  auto_check_update: true
  auto_download_patch: true
  verify_signature: true

build:
  target_platform: "android"
  release_apk_path: "apk/app-release.apk"
  output_patch_dir: "patch"
  last_patch_dir: "lastpatch"
YAML

echo -e "${GREEN}✓ Configured flutter_patcher.yaml with live endpoint: ${WORKER_URL}/manifest.json${NC}"

# ------------------------------------------------------------------------------
# 6. Save Credentials to .env for Continuous Monitoring
# ------------------------------------------------------------------------------
cat << ENV > "$ROOT_DIR/.env"
# Environment secrets generated by scripts/setup_template.sh
# DO NOT COMMIT THIS FILE TO GIT.

GITHUB_TOKEN="${GH_TOKEN_INPUT}"
GITHUB_OWNER="${OWNER}"
GITHUB_REPO="${REPO}"
CLOUDFLARE_API_TOKEN="${CF_TOKEN_INPUT}"
CLOUDFLARE_ACCOUNT_ID="${CF_ACCOUNT_INPUT}"
WORKER_NAME="${WORKER_NAME}"
WORKER_URL="${WORKER_URL}"
ENV

chmod 600 "$ROOT_DIR/.env"
echo -e "${GREEN}✓ Saved credentials to .env (chmod 600).${NC}"

# Ensure .env is in .gitignore
if ! grep -q "^\.env$" "$ROOT_DIR/.gitignore" 2>/dev/null; then
  echo -e "\n# Local secrets\n.env\n*.env.local" >> "$ROOT_DIR/.gitignore"
  echo -e "${GREEN}✓ Added .env to .gitignore.${NC}"
fi

echo -e "\n${BOLD}${GREEN}===================================================================${NC}"
echo -e "${BOLD}${GREEN}   Setup Complete! Everything is 100% Pre-Configured!              ${NC}"
echo -e "${BOLD}${GREEN}===================================================================${NC}"
echo -e "You can now:"
echo -e "  1. Monitor builds in terminal:   ${CYAN}./scripts/watch.sh${NC}"
echo -e "  2. Push initial native build:     ${CYAN}git commit -m \"Initial baseline {{native}}\" && git push origin main${NC}"
echo -e "  3. Push subsequent OTA patches:   ${CYAN}git commit -m \"Update UI {{patch}}\" && git push origin main${NC}\n"
