#!/usr/bin/env bash
# auto-pr.sh — Stop hook: pushes branch, creates Bitbucket PR, triggers review agent
set -euo pipefail

INPUT=$(cat)

# Prevent infinite loop: if the stop hook already fired once, let Claude stop
STOP_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false')
if [ "$STOP_ACTIVE" = "true" ]; then
  exit 0
fi

# Load Bitbucket config from .env
ENV_FILE="$(git rev-parse --show-toplevel 2>/dev/null)/.env"
if [ ! -f "$ENV_FILE" ]; then
  exit 0
fi

# Safe env loading: read line-by-line with proper quoting
while IFS='=' read -r key value; do
  case "$key" in
    BITBUCKET_TOKEN|BITBUCKET_BASE_URL|BITBUCKET_PROJECT|BITBUCKET_REPO|BITBUCKET_REVIEWER|BITBUCKET_DEFAULT_BRANCH)
      export "$key=$value"
      ;;
  esac
done < <(grep -E '^BITBUCKET_(TOKEN|BASE_URL|PROJECT|REPO|REVIEWER|DEFAULT_BRANCH)=' "$ENV_FILE")

# Must have Bitbucket config
if [ -z "${BITBUCKET_TOKEN:-}" ] || [ -z "${BITBUCKET_BASE_URL:-}" ]; then
  exit 0
fi

DEFAULT_BRANCH="${BITBUCKET_DEFAULT_BRANCH:-main}"
REVIEWER="${BITBUCKET_REVIEWER:-}"

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")

# Only act on feature/fix/infra/docs branches, never the default branch
if [ -z "$BRANCH" ] || [ "$BRANCH" = "$DEFAULT_BRANCH" ] || [ "$BRANCH" = "HEAD" ]; then
  exit 0
fi
if ! echo "$BRANCH" | grep -qE '^(feature|fix|infra|docs)/'; then
  exit 0
fi

# Must have local commits ahead of remote (or no remote tracking at all)
UPSTREAM=$(git rev-parse --abbrev-ref "@{u}" 2>/dev/null || echo "")
if [ -n "$UPSTREAM" ]; then
  AHEAD=$(git rev-list --count "$UPSTREAM..HEAD" 2>/dev/null || echo "0")
  if [ "$AHEAD" = "0" ]; then
    BB_API="${BITBUCKET_BASE_URL}/rest/api/1.0/projects/${BITBUCKET_PROJECT}/repos/${BITBUCKET_REPO}/pull-requests"
    EXISTING=$(curl -sf -H "Authorization: Bearer $BITBUCKET_TOKEN" \
      "${BB_API}?state=OPEN&direction=OUTGOING&at=refs/heads/${BRANCH}" \
      | jq '.size // 0' || echo "0")
    if [ "$EXISTING" != "0" ]; then
      exit 0
    fi
    exit 0
  fi
fi

# Configure git identity for push (repo-local only)
git config --local user.name "claude-bot"
git config --local user.email "claude-bot@ethora.dev"

# Push branch to origin
if ! git push -u origin "$BRANCH" 2>&1; then
  echo "Failed to push branch $BRANCH" >&2
  exit 0
fi

# Check if a PR already exists for this branch
BB_API="${BITBUCKET_BASE_URL}/rest/api/1.0/projects/${BITBUCKET_PROJECT}/repos/${BITBUCKET_REPO}/pull-requests"
EXISTING_PR=$(curl -sf -H "Authorization: Bearer $BITBUCKET_TOKEN" \
  "${BB_API}?state=OPEN" \
  | jq -r --arg branch "$BRANCH" '.values[]? | select(.fromRef.id == "refs/heads/\($branch)") | .id' \
  || echo "")

if [ -n "$EXISTING_PR" ]; then
  printf '{"decision":"block","reason":"Branch %s pushed. PR #%s already exists. Please review it now using the review-pr agent: /review-pr %s"}' \
    "$BRANCH" "$EXISTING_PR" "$EXISTING_PR"
  exit 2
fi

# Build PR title from branch name: feature/engine-core → "feature: engine core"
PR_PREFIX=$(echo "$BRANCH" | cut -d/ -f1)
PR_SUBJECT=$(echo "$BRANCH" | cut -d/ -f2- | tr '-' ' ')
PR_TITLE="${PR_PREFIX}: ${PR_SUBJECT}"

# Collect commit messages for description
COMMITS=$(git log --oneline "origin/${DEFAULT_BRANCH}..HEAD" 2>&1 | head -20 || echo "(no commit log)")

# Create PR
PR_BODY=$(cat <<PEOF
## Summary

Branch: \`${BRANCH}\`

### Commits
\`\`\`
${COMMITS}
\`\`\`

---
*PR created automatically by claude-bot*
PEOF
)

# Build reviewers array: include reviewer if configured
if [ -n "$REVIEWER" ]; then
  REVIEWERS=$(jq -n --arg user "$REVIEWER" '[{ user: { name: $user } }]')
else
  REVIEWERS="[]"
fi

PR_PAYLOAD=$(jq -n \
  --arg title "$PR_TITLE" \
  --arg desc "$PR_BODY" \
  --arg branch "$BRANCH" \
  --arg default_branch "$DEFAULT_BRANCH" \
  --arg project "$BITBUCKET_PROJECT" \
  --arg repo "$BITBUCKET_REPO" \
  --argjson reviewers "$REVIEWERS" \
  '{
    title: $title,
    description: $desc,
    fromRef: {
      id: ("refs/heads/" + $branch),
      repository: { slug: $repo, project: { key: $project } }
    },
    toRef: {
      id: ("refs/heads/" + $default_branch),
      repository: { slug: $repo, project: { key: $project } }
    },
    reviewers: $reviewers
  }')

RESPONSE=$(curl -sf -X POST \
  -H "Authorization: Bearer $BITBUCKET_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$PR_PAYLOAD" \
  "$BB_API" 2>&1 || echo "")

if [ -z "$RESPONSE" ]; then
  echo "Failed to create PR for branch $BRANCH" >&2
  exit 0
fi

PR_ID=$(echo "$RESPONSE" | jq -r '.id // empty' || echo "")
PR_LINK=$(echo "$RESPONSE" | jq -r '.links.self[0].href // empty' || echo "")

if [ -z "$PR_ID" ]; then
  echo "PR creation response had no ID: $RESPONSE" >&2
  exit 0
fi

# Block stop and tell Claude to review the PR
printf '{"decision":"block","reason":"PR #%s created for branch %s (%s). Please review it now using the review-pr agent."}' \
  "$PR_ID" "$BRANCH" "$PR_LINK"
exit 2
