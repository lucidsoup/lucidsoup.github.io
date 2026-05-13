cmake_minimum_required(VERSION 3.24)

list(APPEND CMAKE_MODULE_PATH "${CMAKE_CURRENT_SOURCE_DIR}/cmake")

include(Version)

project(soupmix
    VERSION ${SOUPMIX_VERSION}
    DESCRIPTION "VJ / generative visual mixer with node graph and projection mapping"
    LANGUAGES C CXX
)

include(StandardProjectSettings)
include(CompilerWarnings)
include(Sanitizers)
include(Dependencies)

option(SOUPMIX_BUILD_TESTS   "Build unit tests"        ON)
option(SOUPMIX_BUILD_TOOLS   "Build helper tools"      ON)
option(SOUPMIX_ENABLE_ASAN   "Enable AddressSanitizer" OFF)
option(SOUPMIX_ENABLE_UBSAN  "Enable UB Sanitizer"     OFF)

add_library(soupmix_warnings INTERFACE)
soupmix_set_project_warnings(soupmix_warnings)

add_library(soupmix_sanitizers INTERFACE)
soupmix_enable_sanitizers(soupmix_sanitizers)

# -----------------------------------------------------------------------------
# Core library: all engine code except main()
# -----------------------------------------------------------------------------
add_library(soupmix_core STATIC)
add_library(soupmix::core ALIAS soupmix_core)

target_include_directories(soupmix_core
    PUBLIC
        $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
)

target_compile_features(soupmix_core PUBLIC cxx_std_20)

target_link_libraries(soupmix_core
    PUBLIC
        glfw
        glad::glad
        imgui::imgui
        imgui_node_editor
        glm::glm
        fmt::fmt
        nlohmann_json::nlohmann_json
        spdlog::spdlog
        rtmidi
        oscpack
        OpenGL::GL
        Threads::Threads
        ${CMAKE_DL_LIBS}
    PRIVATE
        soupmix_warnings
        soupmix_sanitizers
)

add_subdirectory(src)

# -----------------------------------------------------------------------------
# Main executable
# -----------------------------------------------------------------------------
add_executable(soupmix src/main.cpp)
target_link_libraries(soupmix PRIVATE soupmix::core soupmix_warnings soupmix_sanitizers)

set_target_properties(soupmix PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin"
)

# Make assets and shaders discoverable next to the binary.
target_compile_definitions(soupmix_core PUBLIC
    SOUPMIX_SOURCE_ROOT="${CMAKE_CURRENT_SOURCE_DIR}"
)

if(SOUPMIX_BUILD_TESTS)
    enable_testing()
    add_subdirectory(tests)
endif()

if(SOUPMIX_BUILD_TOOLS)
    add_subdirectory(tools)
endif()

message(STATUS "soupmix ${SOUPMIX_VERSION} configured")
message(STATUS "  Tests:  ${SOUPMIX_BUILD_TESTS}")
message(STATUS "  Tools:  ${SOUPMIX_BUILD_TOOLS}")
message(STATUS "  ASan:   ${SOUPMIX_ENABLE_ASAN}")
message(STATUS "  UBSan:  ${SOUPMIX_ENABLE_UBSAN}")
