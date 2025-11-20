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

# Include nlohmann/json (header-only)
include(FetchContent)

FetchContent_Declare(
    json
    GIT_REPOSITORY https://github.com/nlohmann/json.git
    GIT_TAG v3.11.3
)
FetchContent_MakeAvailable(json)

# Download and setup libnest2d (header-only)
FetchContent_Declare(
    libnest2d
    GIT_REPOSITORY https://github.com/tamasmeszaros/libnest2d.git
    GIT_TAG master
)
FetchContent_MakeAvailable(libnest2d)

# Download Clipper library
FetchContent_Declare(
    clipper
    GIT_REPOSITORY https://github.com/cpp-libs/clipper.git
    GIT_TAG v6.4.2
)
FetchContent_MakeAvailable(clipper)

# Main executable
add_executable(nest-packer src/main.cpp)

target_include_directories(nest-packer PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${Boost_INCLUDE_DIRS}
    ${libnest2d_SOURCE_DIR}/include
    ${clipper_SOURCE_DIR}
)

target_link_libraries(nest-packer PRIVATE
    nlohmann_json::nlohmann_json
    Boost::boost
    Threads::Threads
)

# Install
install(TARGETS nest-packer DESTINATION bin)
