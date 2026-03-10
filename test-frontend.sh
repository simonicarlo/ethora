#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/frontend"

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
echo -e "${BOLD}║    Agent Council · Frontend Tests      ║${RESET}"
echo -e "${BOLD}╚════════════════════════════════════════╝${RESET}"
echo ""

# --- Check Node ---
echo -e "${BOLD}Prerequisites${RESET}"
if ! command -v node &>/dev/null; then
    echo -e "  ${CROSS} Node.js not found. Please install Node.js 20+."
    exit 1
fi
echo -e "  ${CHECK} Node.js $(node -v)"

# --- Install dependencies ---
if [ ! -d "node_modules" ]; then
    echo -e "  ${ARROW} Installing dependencies..."
    npm install
    echo -e "  ${CHECK} Dependencies installed"
else
    echo -e "  ${CHECK} Dependencies already installed"
fi
echo ""

# --- Run tests ---
echo -e "${BOLD}Running tests${RESET}"
echo -e "${DIM}────────────────────────────────────────${RESET}"
echo ""

npx ng test "$@"
