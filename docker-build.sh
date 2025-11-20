#!/bin/bash
# Docker build script with git version information

set -e

echo "======================================"
echo "Building Mosaic Docker Image"
echo "======================================"

# Capture git information
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
GIT_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo ""
echo "Version Information:"
echo "  Branch: $GIT_BRANCH"
echo "  Commit: ${GIT_COMMIT:0:7}"
echo "  Build Time: $BUILD_TIME"
echo ""

# Build Docker image with build args
docker build \
  --build-arg GIT_BRANCH="$GIT_BRANCH" \
  --build-arg GIT_COMMIT="$GIT_COMMIT" \
  --build-arg BUILD_TIME="$BUILD_TIME" \
  -t mosaic:latest \
  -t mosaic:$GIT_BRANCH \
  .

echo ""
echo "======================================"
echo "Build Complete!"
echo "======================================"
echo ""
echo "Image tagged as:"
echo "  - mosaic:latest"
echo "  - mosaic:$GIT_BRANCH"
echo ""
echo "Run with:"
echo "  docker run -p 8084:3000 mosaic:latest"
echo ""
