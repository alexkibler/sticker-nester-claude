#!/bin/bash

# E2E Test Runner Script
# This script starts both backend and frontend servers, runs E2E tests, and cleans up

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=========================================="
echo -e "E2E Test Runner"
echo -e "==========================================${NC}\n"

# Store PIDs for cleanup
BACKEND_PID=""
FRONTEND_PID=""

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}Cleaning up...${NC}"

    if [ -n "$BACKEND_PID" ]; then
        echo "Stopping backend (PID: $BACKEND_PID)"
        kill $BACKEND_PID 2>/dev/null || true
        wait $BACKEND_PID 2>/dev/null || true
    fi

    if [ -n "$FRONTEND_PID" ]; then
        echo "Stopping frontend (PID: $FRONTEND_PID)"
        kill $FRONTEND_PID 2>/dev/null || true
        wait $FRONTEND_PID 2>/dev/null || true
    fi

    # Also kill any remaining node processes on our ports
    lsof -ti:3001 | xargs kill -9 2>/dev/null || true
    lsof -ti:4201 | xargs kill -9 2>/dev/null || true

    echo -e "${GREEN}Cleanup complete${NC}"
}

# Set trap to cleanup on exit
trap cleanup EXIT INT TERM

# Check if ports are available
if lsof -Pi :3001 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo -e "${RED}Port 3001 is already in use. Please stop the service and try again.${NC}"
    exit 1
fi

if lsof -Pi :4201 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo -e "${RED}Port 4201 is already in use. Please stop the service and try again.${NC}"
    exit 1
fi

# Start backend server
echo -e "${YELLOW}Starting backend server...${NC}"
cd server
npm run dev > ../e2e-backend.log 2>&1 &
BACKEND_PID=$!
cd ..
echo -e "${GREEN}✓ Backend started (PID: $BACKEND_PID)${NC}"

# Wait for backend to be ready
echo -e "${YELLOW}Waiting for backend to be ready...${NC}"
for i in {1..30}; do
    if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Backend is ready${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}✗ Backend failed to start in time${NC}"
        cat e2e-backend.log
        exit 1
    fi
    sleep 1
done

# Start frontend server
echo -e "${YELLOW}Starting frontend server...${NC}"
npm start > e2e-frontend.log 2>&1 &
FRONTEND_PID=$!
echo -e "${GREEN}✓ Frontend started (PID: $FRONTEND_PID)${NC}"

# Wait for frontend to be ready
echo -e "${YELLOW}Waiting for frontend to be ready...${NC}"
for i in {1..60}; do
    if curl -s http://localhost:4201 > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Frontend is ready${NC}"
        break
    fi
    if [ $i -eq 60 ]; then
        echo -e "${RED}✗ Frontend failed to start in time${NC}"
        cat e2e-frontend.log
        exit 1
    fi
    sleep 2
done

# Give servers a moment to stabilize
sleep 3

# Run E2E tests
echo -e "\n${YELLOW}Running E2E tests...${NC}\n"
npx ts-node e2e/polygon-packing.e2e.ts

# Exit code from tests
TEST_EXIT_CODE=$?

if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo -e "\n${GREEN}✓ All E2E tests passed!${NC}"
else
    echo -e "\n${RED}✗ Some E2E tests failed${NC}"
fi

exit $TEST_EXIT_CODE
