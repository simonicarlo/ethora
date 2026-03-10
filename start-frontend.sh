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
echo -e "${BOLD}║           ETHORA · Frontend            ║${RESET}"
echo -e "${BOLD}╚════════════════════════════════════════╝${RESET}"
echo ""

# --- Check Node.js ---
echo -e "${BOLD}Prerequisites${RESET}"
if ! command -v node &>/dev/null; then
    echo -e "  ${CROSS} Node.js not found. Please install Node.js 20+."
    exit 1
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 20 ]; then
    echo -e "  ${CROSS} Node.js v$NODE_MAJOR found, but v20+ is required."
    exit 1
fi
echo -e "  ${CHECK} Node.js $(node --version)"

if ! command -v npm &>/dev/null; then
    echo -e "  ${CROSS} npm not found. Please install npm."
    exit 1
fi
echo -e "  ${CHECK} npm $(npm --version)"
echo ""

# --- Install dependencies ---
cd frontend
if [ ! -d "node_modules" ]; then
    echo -e "${BOLD}Installing dependencies${RESET} ${DIM}(first run)${RESET}"
    npm install
    echo ""
fi

# --- Start dev server ---
echo -e "${BOLD}Starting dev server${RESET} ${DIM}(Vite)${RESET}"
echo -e "  ${ARROW} frontend ${DIM}Angular 21${RESET}     http://localhost:4200"
echo -e "  ${ARROW} proxy    ${DIM}/api/*${RESET}         http://localhost:8000"
echo ""
echo -e "${DIM}  Make sure the backend is running first!${RESET}"
echo ""
echo -e "${DIM}  Press Ctrl+C to stop${RESET}"
echo -e "${DIM}────────────────────────────────────────${RESET}"
echo ""

npx ng serve
