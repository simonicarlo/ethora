#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/backend"

# -- Colors --
BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
RED='\033[0;31m'
RESET='\033[0m'
CHECK="${GREEN}✔${RESET}"
CROSS="${RED}✘${RESET}"
ARROW="${CYAN}→${RESET}"

echo ""
echo -e "${BOLD}╔════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║     Agent Council · Backend Tests      ║${RESET}"
echo -e "${BOLD}╚════════════════════════════════════════╝${RESET}"
echo ""

# --- Check Python venv ---
echo -e "${BOLD}Prerequisites${RESET}"
if [ -d ".venv" ]; then
    source .venv/bin/activate
    echo -e "  ${CHECK} Virtual environment activated"
else
    echo -e "  ${ARROW} Creating virtual environment..."
    python3 -m venv .venv
    source .venv/bin/activate
    echo -e "  ${CHECK} Virtual environment created"
fi

# --- Install dependencies ---
echo -e "  ${ARROW} Installing dependencies..."
pip install -q -r requirements.txt
echo -e "  ${CHECK} Dependencies installed"
echo ""

# --- Run tests ---
echo -e "${BOLD}Running tests${RESET}"
echo -e "${DIM}────────────────────────────────────────${RESET}"
echo ""

pytest -v "$@"
