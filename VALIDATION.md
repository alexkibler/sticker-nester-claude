# Pre-Push Validation

This project includes automatic validation to ensure code quality before pushing.

## What Gets Validated

1. **Git Status** - Ensures no uncommitted changes
2. **Backend Build** - TypeScript compilation (`server/`)
3. **Backend Tests** - All Jest tests (106 tests)
4. **Frontend Build** - Angular production build
5. **TypeScript Strict Mode** - Ensures type safety

## Automatic Validation

### Git Pre-Push Hook

A pre-push hook automatically runs validation before every `git push`.

**Location:** `.git/hooks/pre-push`

The hook will:
- ✅ Run all validation checks
- ✅ Block the push if validation fails
- ✅ Show clear error messages with logs

**To bypass (NOT RECOMMENDED):**
```bash
git push --no-verify
```

## Manual Validation

You can run validation manually at any time:

```bash
./validate.sh
```

This is useful for:
- Testing before committing
- Debugging validation failures
- CI/CD setup testing

## Validation Logs

Logs are saved to `/tmp/` for debugging:
- `/tmp/backend-build.log` - Backend TypeScript compilation
- `/tmp/backend-test.log` - Backend test results
- `/tmp/frontend-build.log` - Frontend Angular build

## Setting Up (New Clone)

After cloning the repository:

```bash
# Install dependencies
npm install
cd server && npm install && cd ..

# Make validation script executable
chmod +x validate.sh

# Set up pre-push hook (should already exist)
chmod +x .git/hooks/pre-push

# Test validation
./validate.sh
```

## CI/CD Integration

The validation script is designed to work in CI/CD pipelines:

```yaml
# Example GitHub Actions
- name: Validate Build
  run: ./validate.sh
```

## Common Issues

### Issue: Frontend build fails with "Cannot find module 'socket.io-client'"
**Solution:**
```bash
npm install socket.io-client
```

### Issue: Puppeteer download fails
**Solution:** The validation script automatically sets `PUPPETEER_SKIP_DOWNLOAD=true`

### Issue: Backend tests fail
**Solution:** Check `/tmp/backend-test.log` for detailed error messages

## Validation Time

Typical validation time:
- Backend build: ~5-10s
- Backend tests: ~7-10s
- Frontend build: ~6-10s
- **Total: ~20-30s**

## Why Validation Matters

The validation process caught the TypeScript errors that would have failed in Docker build:
- ❌ Without validation: Fails in Docker after 5+ minutes
- ✅ With validation: Fails locally in 20-30 seconds

This saves:
- Time (faster feedback)
- CI/CD resources
- Docker registry storage
- Developer frustration
