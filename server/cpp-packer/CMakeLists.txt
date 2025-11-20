cmake_minimum_required(VERSION 3.12)
project(nest-packer VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Optimization flags (removed -march=native for multi-platform compatibility)
if(CMAKE_BUILD_TYPE STREQUAL "Release")
    if(MSVC)
        add_compile_options(/O2 /Ob2 /Oi /Ot)
    else()
        add_compile_options(-O3)
    endif()
endif()

# Find dependencies
find_package(Boost REQUIRED)
find_package(Threads REQUIRED)

# Use system-installed nlohmann/json if available
find_package(nlohmann_json QUIET)

# If libnest2d is not available as a system package, we'll skip it
# and use a simpler rectangle packing approach
set(USE_LIBNEST2D OFF)

# Try to find Clipper (polyclipping on Alpine)
find_path(CLIPPER_INCLUDE_DIR clipper/clipper.hpp PATHS /usr/include /usr/local/include)
find_library(CLIPPER_LIBRARY NAMES polyclipping clipper PATHS /usr/lib /usr/local/lib)

if(CLIPPER_INCLUDE_DIR AND CLIPPER_LIBRARY)
    set(CLIPPER_FOUND TRUE)
    message(STATUS "Found Clipper: ${CLIPPER_LIBRARY}")
else()
    message(WARNING "Clipper not found - build may fail")
endif()

# Main executable
# Using stub version until libnest2d dependencies are fully configured
# To use full implementation, change src/main-stub.cpp to src/main.cpp
add_executable(nest-packer src/main-stub.cpp)

# Minimal dependencies for stub
# (No Boost or Clipper needed for stub version)

# Install
install(TARGETS nest-packer DESTINATION bin)
