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
export $(grep -E '^BITBUCKET_TOKEN=|^BITBUCKET_BASE_URL=|^BITBUCKET_PROJECT=|^BITBUCKET_REPO=' "$ENV_FILE" | xargs)

# Must have Bitbucket config
if [ -z "${BITBUCKET_TOKEN:-}" ] || [ -z "${BITBUCKET_BASE_URL:-}" ]; then
  exit 0
fi

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")

# Only act on feature/fix/infra/docs branches, never main
if [ -z "$BRANCH" ] || [ "$BRANCH" = "main" ] || [ "$BRANCH" = "master" ] || [ "$BRANCH" = "HEAD" ]; then
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
    # No new commits — check if PR already exists
    BB_API="${BITBUCKET_BASE_URL}/rest/api/1.0/projects/${BITBUCKET_PROJECT}/repos/${BITBUCKET_REPO}/pull-requests"
    EXISTING=$(curl -sf -H "Authorization: Bearer $BITBUCKET_TOKEN" \
      "${BB_API}?state=OPEN&direction=OUTGOING&at=refs/heads/${BRANCH}" 2>/dev/null \
      | jq '.size // 0' 2>/dev/null || echo "0")
    if [ "$EXISTING" != "0" ]; then
      exit 0
    fi
    # No new commits and no PR — nothing to do
    exit 0
  fi
fi

# Configure git identity for push
git config user.name "claude-bot"
git config user.email "claude-bot@ethora.dev"

# Push branch to origin
git push -u origin "$BRANCH" 2>/dev/null || {
  echo "Failed to push branch $BRANCH" >&2
  exit 0
}

# Check if a PR already exists for this branch
BB_API="${BITBUCKET_BASE_URL}/rest/api/1.0/projects/${BITBUCKET_PROJECT}/repos/${BITBUCKET_REPO}/pull-requests"
EXISTING_PR=$(curl -sf -H "Authorization: Bearer $BITBUCKET_TOKEN" \
  "${BB_API}?state=OPEN" 2>/dev/null \
  | jq -r --arg branch "$BRANCH" '.values[]? | select(.fromRef.id == "refs/heads/\($branch)") | .id' 2>/dev/null \
  || echo "")

if [ -n "$EXISTING_PR" ]; then
  # PR exists — output its number for the review agent
  printf '{"decision":"block","reason":"Branch %s pushed. PR #%s already exists. Please review it now using the review-pr agent: /review-pr %s"}' \
    "$BRANCH" "$EXISTING_PR" "$EXISTING_PR"
  exit 2
fi

# Build PR title from branch name: feature/engine-core → "feature: engine core"
PR_PREFIX=$(echo "$BRANCH" | cut -d/ -f1)
PR_SUBJECT=$(echo "$BRANCH" | cut -d/ -f2- | tr '-' ' ')
PR_TITLE="${PR_PREFIX}: ${PR_SUBJECT}"

# Collect commit messages for description
COMMITS=$(git log --oneline "origin/main..HEAD" 2>/dev/null | head -20 || echo "(no commit log)")

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

PR_PAYLOAD=$(jq -n \
  --arg title "$PR_TITLE" \
  --arg desc "$PR_BODY" \
  --arg branch "$BRANCH" \
  --arg project "$BITBUCKET_PROJECT" \
  --arg repo "$BITBUCKET_REPO" \
  '{
    title: $title,
    description: $desc,
    fromRef: {
      id: ("refs/heads/" + $branch),
      repository: { slug: $repo, project: { key: $project } }
    },
    toRef: {
      id: "refs/heads/main",
      repository: { slug: $repo, project: { key: $project } }
    },
    reviewers: [
      { user: { name: "shost" } }
    ]
  }')

RESPONSE=$(curl -sf -X POST \
  -H "Authorization: Bearer $BITBUCKET_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$PR_PAYLOAD" \
  "$BB_API" 2>/dev/null || echo "")

if [ -z "$RESPONSE" ]; then
  echo "Failed to create PR for branch $BRANCH" >&2
  exit 0
fi

PR_ID=$(echo "$RESPONSE" | jq -r '.id // empty' 2>/dev/null || echo "")
PR_LINK=$(echo "$RESPONSE" | jq -r '.links.self[0].href // empty' 2>/dev/null || echo "")

if [ -z "$PR_ID" ]; then
  echo "PR creation response had no ID" >&2
  exit 0
fi

# Block stop and tell Claude to review the PR
printf '{"decision":"block","reason":"PR #%s created for branch %s (%s). Please review it now using the review-pr agent."}' \
  "$PR_ID" "$BRANCH" "$PR_LINK"
exit 2
