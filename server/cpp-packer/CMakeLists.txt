cmake_minimum_required(VERSION 3.12)
project(nest-packer VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Optimization flags
if(CMAKE_BUILD_TYPE STREQUAL "Release")
    if(MSVC)
        add_compile_options(/O2)
    else()
        add_compile_options(-O3)
    endif()
endif()

# Main executable - using stub version (no dependencies needed)
# The stub is a minimal program that just returns "not implemented"
# This allows the Docker build to succeed without complex dependencies
add_executable(nest-packer src/main-stub.cpp)

# No dependencies needed for stub version
# (main-stub.cpp only uses <iostream> which is part of the standard library)

# Install
install(TARGETS nest-packer DESTINATION bin)
