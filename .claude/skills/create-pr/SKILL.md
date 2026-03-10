---
name: create-pr
description: Push the current branch and create a Bitbucket PR. Usage /create-pr [optional title]
user_invocable: true
metadata:
  author: claude-bot
  version: "1.0.0"
  domain: devops
  triggers: create PR, push PR, open PR, Bitbucket PR, pull request
  role: developer
  scope: git
  output-format: text
---

# Create PR — Bitbucket

Push the current feature branch and create a pull request on Bitbucket Server.

## Bitbucket API

Credentials and config live in `.env.bitbucket` at the repo root:

```
BITBUCKET_TOKEN=...
BITBUCKET_BASE_URL=https://stash.ergon.ch
BITBUCKET_PROJECT=EHACKATHON
BITBUCKET_REPO=ethora
BITBUCKET_REVIEWER=csimoni
BITBUCKET_DEFAULT_BRANCH=main
```

Load them at the start:
```bash
export $(grep -E '^BITBUCKET_(TOKEN|BASE_URL|PROJECT|REPO|REVIEWER|DEFAULT_BRANCH)=' .env.bitbucket | xargs)
```

## Instructions

When this skill is invoked, follow these steps in order:

### 1. Validate branch

- Get the current branch name via `git rev-parse --abbrev-ref HEAD`.
- **Abort** if on `main` or `master` — never create a PR from the default branch.
- **Abort** if the branch doesn't match `feature/`, `fix/`, `infra/`, or `docs/` prefixes.

### 2. Check for unpushed work

- Run `git status` to check for uncommitted changes. If there are staged or unstaged changes, **ask the user** whether to commit first (suggest using `/commit`).
- Run `git log origin/main..HEAD --oneline` to confirm there are commits to push. If none, abort with a message.

### 3. Check for merge conflicts with main

```bash
git fetch origin
git merge --no-commit --no-ff origin/main
```

- If conflicts exist, abort and tell the user to resolve them.
- If clean, abort the test merge: `git merge --abort`

### 4. Push the branch

```bash
git push -u origin <branch>
```

### 5. Check for existing PR

Query the Bitbucket API for open PRs from this branch:

```bash
curl -s -H "Authorization: Bearer $BITBUCKET_TOKEN" \
  "${BITBUCKET_BASE_URL}/rest/api/1.0/projects/${BITBUCKET_PROJECT}/repos/${BITBUCKET_REPO}/pull-requests?state=OPEN" \
  | jq -r --arg branch "<branch>" '.values[]? | select(.fromRef.id == "refs/heads/\($branch)") | .id'
```

If a PR already exists, report its URL and skip creation.

### 6. Build PR title and description

**Title**: If the user provided a title argument, use it. Otherwise, derive from the branch name:
- `feature/sse-type-alignment` → `feat: sse type alignment`
- `fix/vote-mapping` → `fix: vote mapping`

Map branch prefix to conventional commit prefix: `feature/` → `feat:`, `fix/` → `fix:`, `infra/` → `infra:`, `docs/` → `docs:`

**Description**: Build a structured description:

```markdown
## Summary
<Analyze the commits and write 1-3 bullet points summarizing the changes>

## Test plan
<Based on what changed, list relevant verification steps>

### Commits
```
<output of git log --oneline origin/main..HEAD>
```

🤖 Generated with Claude Code
```

### 7. Create the PR

```bash
BB_API="${BITBUCKET_BASE_URL}/rest/api/1.0/projects/${BITBUCKET_PROJECT}/repos/${BITBUCKET_REPO}/pull-requests"

PR_PAYLOAD=$(jq -n \
  --arg title "<title>" \
  --arg desc "<description>" \
  --arg branch "<branch>" \
  --arg default_branch "${BITBUCKET_DEFAULT_BRANCH:-main}" \
  --arg project "$BITBUCKET_PROJECT" \
  --arg repo "$BITBUCKET_REPO" \
  --arg reviewer "$BITBUCKET_REVIEWER" \
  '{
    title: $title,
    description: $desc,
    fromRef: { id: ("refs/heads/" + $branch), repository: { slug: $repo, project: { key: $project } } },
    toRef: { id: ("refs/heads/" + $default_branch), repository: { slug: $repo, project: { key: $project } } },
    reviewers: (if $reviewer != "" then [{ user: { name: $reviewer } }] else [] end)
  }')

curl -s -X POST \
  -H "Authorization: Bearer $BITBUCKET_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$PR_PAYLOAD" \
  "$BB_API"
```

### 8. Report result

Extract the PR ID and URL from the response:
```bash
jq '{id: .id, title: .title, state: .state, link: .links.self[0].href}'
```

Report the PR number and URL to the user. If the API returned an error, show the error message.

## Important rules

- **Never create PRs from main/master.**
- **Never force-push.** Use regular `git push`.
- **Always check for existing PRs** to avoid duplicates.
- **Always check for merge conflicts** before pushing.
- **Load credentials from `.env.bitbucket`** — never hardcode tokens.
- If `.env.bitbucket` is missing or incomplete, tell the user what's needed.
