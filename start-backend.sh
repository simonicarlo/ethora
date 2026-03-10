#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# -- Colors --
BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
RESET='\033[0m'
CHECK="${GREEN}✔${RESET}"
CROSS="${RED}✘${RESET}"
ARROW="${CYAN}→${RESET}"

echo ""
echo -e "${BOLD}╔════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║       Agent Council · Backend          ║${RESET}"
echo -e "${BOLD}╚════════════════════════════════════════╝${RESET}"
echo ""

# --- Check Docker ---
echo -e "${BOLD}Prerequisites${RESET}"
if ! command -v docker &>/dev/null; then
    echo -e "  ${CROSS} Docker not found. Please install Docker Desktop."
    exit 1
fi

if ! docker info &>/dev/null 2>&1; then
    echo -e "  ${CROSS} Docker daemon is not running. Please start Docker Desktop."
    exit 1
fi
echo -e "  ${CHECK} Docker is ready"

# --- Check .env ---
if [ ! -f ".env" ]; then
    echo ""
    echo -e "  ${YELLOW}!${RESET} No .env file found — creating from .env.example"
    cp .env.example .env
    echo -e "  ${CHECK} Created ${DIM}.env${RESET}"
    echo -e "  ${YELLOW}!${RESET} Add your ${BOLD}ANTHROPIC_API_KEY${RESET} to .env before using LLM features"
else
    echo -e "  ${CHECK} .env file found"
fi
echo ""

# --- Start services ---
echo -e "${BOLD}Starting services${RESET}"
echo -e "  ${ARROW} db       ${DIM}PostgreSQL 16${RESET}   http://localhost:5432"
echo -e "  ${ARROW} backend  ${DIM}FastAPI${RESET}         http://localhost:8000"
echo ""
echo -e "${DIM}  TIP: Run ${RESET}${BOLD}./start-frontend.sh${RESET}${DIM} in a second terminal${RESET}"
echo ""
echo -e "${DIM}  Press Ctrl+C to stop${RESET}"
echo -e "${DIM}────────────────────────────────────────${RESET}"
echo ""

docker compose up --build db backend
