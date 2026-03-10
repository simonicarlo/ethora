#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# -- Colors --
BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[0;32m'
RED='\033[0;31m'
RESET='\033[0m'
CHECK="${GREEN}✔${RESET}"
CROSS="${RED}✘${RESET}"

BACKEND_OK=0
FRONTEND_OK=0

# --- Backend ---
"$SCRIPT_DIR/test-backend.sh" || BACKEND_OK=1

echo ""

# --- Frontend ---
"$SCRIPT_DIR/test-frontend.sh" || FRONTEND_OK=1

# --- Summary ---
echo ""
echo -e "${BOLD}╔════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║           Test Summary                 ║${RESET}"
echo -e "${BOLD}╚════════════════════════════════════════╝${RESET}"
echo ""

if [ $BACKEND_OK -eq 0 ]; then
    echo -e "  ${CHECK} Backend tests passed"
else
    echo -e "  ${CROSS} Backend tests failed"
fi

if [ $FRONTEND_OK -eq 0 ]; then
    echo -e "  ${CHECK} Frontend tests passed"
else
    echo -e "  ${CROSS} Frontend tests failed"
fi

echo ""

# Exit with failure if either suite failed
[ $BACKEND_OK -eq 0 ] && [ $FRONTEND_OK -eq 0 ]
