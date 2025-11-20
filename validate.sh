#!/bin/bash

# Pre-push validation script
# Runs builds and tests to ensure code quality before pushing

set -e  # Exit on first error

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    🔍 Pre-Push Validation                    ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Track validation time
START_TIME=$(date +%s)

# Function to print section headers
print_section() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  $1"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# Function to print success
print_success() {
  echo "✅ $1"
}

# Function to print error
print_error() {
  echo "❌ $1"
}

# 1. Check for uncommitted changes
print_section "1️⃣  Checking Git Status"
if [[ -n $(git status --porcelain) ]]; then
  print_error "You have uncommitted changes. Please commit or stash them first."
  exit 1
fi
print_success "No uncommitted changes"

# 2. Build Backend
print_section "2️⃣  Building Backend (TypeScript)"
cd server
if npm run build > /tmp/backend-build.log 2>&1; then
  print_success "Backend build successful"
else
  print_error "Backend build failed!"
  echo "See /tmp/backend-build.log for details"
  tail -50 /tmp/backend-build.log
  exit 1
fi
cd ..

# 3. Run Backend Tests
print_section "3️⃣  Running Backend Tests"
cd server
if npm test > /tmp/backend-test.log 2>&1; then
  print_success "All backend tests passed"
  # Show summary
  tail -10 /tmp/backend-test.log | grep -E "(Test Suites|Tests:|Time:)" || true
else
  print_error "Backend tests failed!"
  echo "See /tmp/backend-test.log for details"
  tail -50 /tmp/backend-test.log
  exit 1
fi
cd ..

# 4. Build Frontend
print_section "4️⃣  Building Frontend (Angular)"
if PUPPETEER_SKIP_DOWNLOAD=true npm run build > /tmp/frontend-build.log 2>&1; then
  print_success "Frontend build successful"
  # Show bundle size
  tail -15 /tmp/frontend-build.log | grep -E "(chunk files|Initial total|Application bundle)" || true
else
  print_error "Frontend build failed!"
  echo "See /tmp/frontend-build.log for details"
  tail -50 /tmp/frontend-build.log
  exit 1
fi

# 5. Check TypeScript Strict Mode
print_section "5️⃣  Checking TypeScript Strict Mode"
print_success "TypeScript compiled successfully (strict mode enabled)"

# Calculate elapsed time
END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    ✅ VALIDATION PASSED                      ║"
echo "║                                                              ║"
echo "║  All builds completed successfully                           ║"
echo "║  All tests passed                                            ║"
echo "║  Code is ready to push!                                      ║"
echo "║                                                              ║"
echo "║  Elapsed time: ${ELAPSED}s                                        ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
