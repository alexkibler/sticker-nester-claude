#!/bin/bash
# Build script for nest-packer C++ CLI

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/build"
INSTALL_DIR="$SCRIPT_DIR/bin"

echo "====================================="
echo "Building nest-packer C++ CLI"
echo "====================================="

# Check for required tools
if ! command -v cmake &> /dev/null; then
    echo "ERROR: CMake not found. Please install CMake 3.12 or higher."
    exit 1
fi

if ! command -v g++ &> /dev/null && ! command -v clang++ &> /dev/null; then
    echo "ERROR: C++ compiler not found. Please install g++ or clang++."
    exit 1
fi

# Check for Boost
echo ""
echo "Checking for Boost libraries..."
if ! ldconfig -p | grep -q libboost; then
    echo "WARNING: Boost libraries may not be installed."
    echo "On Ubuntu/Debian: sudo apt-get install libboost-all-dev"
    echo "On macOS: brew install boost"
fi

# Create build directory
echo ""
echo "Creating build directory..."
mkdir -p "$BUILD_DIR"
mkdir -p "$INSTALL_DIR"

# Navigate to build directory
cd "$BUILD_DIR"

# Configure with CMake
echo ""
echo "Configuring with CMake..."
cmake .. \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_INSTALL_PREFIX="$INSTALL_DIR"

# Build
echo ""
echo "Building..."
cmake --build . --config Release -j$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)

# Install
echo ""
echo "Installing to $INSTALL_DIR..."
cmake --install .

echo ""
echo "====================================="
echo "Build complete!"
echo "====================================="
echo "Binary location: $INSTALL_DIR/nest-packer"
echo ""
echo "Test with:"
echo "  echo '{\"stickers\":[...],\"sheetWidth\":12,\"sheetHeight\":12}' | $INSTALL_DIR/nest-packer"
echo ""
