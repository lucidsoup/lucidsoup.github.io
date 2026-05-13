# Third-party dependencies, fetched at configure time.
#
# Strategy: prefer system packages where their CMake config is reliable
# (OpenGL, Threads); fetch everything else via FetchContent so the build is
# self-contained and reproducible.

include(FetchContent)

set(FETCHCONTENT_QUIET OFF)

find_package(OpenGL REQUIRED)
find_package(Threads REQUIRED)

# -----------------------------------------------------------------------------
# GLFW
# -----------------------------------------------------------------------------
set(GLFW_BUILD_DOCS     OFF CACHE INTERNAL "")
set(GLFW_BUILD_TESTS    OFF CACHE INTERNAL "")
set(GLFW_BUILD_EXAMPLES OFF CACHE INTERNAL "")
set(GLFW_INSTALL        OFF CACHE INTERNAL "")
FetchContent_Declare(glfw
    GIT_REPOSITORY https://github.com/glfw/glfw.git
    GIT_TAG        3.4
    GIT_SHALLOW    TRUE
)
FetchContent_MakeAvailable(glfw)

# -----------------------------------------------------------------------------
# glad (OpenGL 4.5 core loader, pre-generated for convenience)
# -----------------------------------------------------------------------------
FetchContent_Declare(glad
    GIT_REPOSITORY https://github.com/Dav1dde/glad.git
    GIT_TAG        v2.0.6
    GIT_SHALLOW    TRUE
)
FetchContent_GetProperties(glad)
if(NOT glad_POPULATED)
    FetchContent_Populate(glad)
    add_subdirectory(${glad_SOURCE_DIR}/cmake ${glad_BINARY_DIR})
    glad_add_library(glad STATIC API gl:core=4.5)
    add_library(glad::glad ALIAS glad)
endif()

# -----------------------------------------------------------------------------
# glm
# -----------------------------------------------------------------------------
FetchContent_Declare(glm
    GIT_REPOSITORY https://github.com/g-truc/glm.git
    GIT_TAG        1.0.1
    GIT_SHALLOW    TRUE
)
FetchContent_MakeAvailable(glm)

# -----------------------------------------------------------------------------
# fmt
# -----------------------------------------------------------------------------
FetchContent_Declare(fmt
    GIT_REPOSITORY https://github.com/fmtlib/fmt.git
    GIT_TAG        10.2.1
    GIT_SHALLOW    TRUE
)
FetchContent_MakeAvailable(fmt)

# -----------------------------------------------------------------------------
# spdlog
# -----------------------------------------------------------------------------
set(SPDLOG_FMT_EXTERNAL ON CACHE INTERNAL "")
FetchContent_Declare(spdlog
    GIT_REPOSITORY https://github.com/gabime/spdlog.git
    GIT_TAG        v1.13.0
    GIT_SHALLOW    TRUE
)
FetchContent_MakeAvailable(spdlog)

# -----------------------------------------------------------------------------
# nlohmann/json
# -----------------------------------------------------------------------------
set(JSON_BuildTests OFF CACHE INTERNAL "")
FetchContent_Declare(nlohmann_json
    GIT_REPOSITORY https://github.com/nlohmann/json.git
    GIT_TAG        v3.11.3
    GIT_SHALLOW    TRUE
)
FetchContent_MakeAvailable(nlohmann_json)

# -----------------------------------------------------------------------------
# Dear ImGui + imgui-node-editor
#
# ImGui has no CMakeLists, so we wrap the sources we want into a library.
# -----------------------------------------------------------------------------
FetchContent_Declare(imgui
    GIT_REPOSITORY https://github.com/ocornut/imgui.git
    GIT_TAG        v1.91.5
    GIT_SHALLOW    TRUE
)
FetchContent_Declare(imgui_node_editor_src
    GIT_REPOSITORY https://github.com/thedmd/imgui-node-editor.git
    GIT_TAG        master
    GIT_SHALLOW    TRUE
)
FetchContent_MakeAvailable(imgui imgui_node_editor_src)

add_library(imgui STATIC
    ${imgui_SOURCE_DIR}/imgui.cpp
    ${imgui_SOURCE_DIR}/imgui_demo.cpp
    ${imgui_SOURCE_DIR}/imgui_draw.cpp
    ${imgui_SOURCE_DIR}/imgui_tables.cpp
    ${imgui_SOURCE_DIR}/imgui_widgets.cpp
    ${imgui_SOURCE_DIR}/backends/imgui_impl_glfw.cpp
    ${imgui_SOURCE_DIR}/backends/imgui_impl_opengl3.cpp
)
target_include_directories(imgui SYSTEM PUBLIC
    ${imgui_SOURCE_DIR}
    ${imgui_SOURCE_DIR}/backends
)
target_link_libraries(imgui PUBLIC glfw OpenGL::GL)
add_library(imgui::imgui ALIAS imgui)

add_library(imgui_node_editor STATIC
    ${imgui_node_editor_src_SOURCE_DIR}/crude_json.cpp
    ${imgui_node_editor_src_SOURCE_DIR}/imgui_canvas.cpp
    ${imgui_node_editor_src_SOURCE_DIR}/imgui_node_editor.cpp
    ${imgui_node_editor_src_SOURCE_DIR}/imgui_node_editor_api.cpp
)
target_include_directories(imgui_node_editor SYSTEM PUBLIC
    ${imgui_node_editor_src_SOURCE_DIR}
)
target_link_libraries(imgui_node_editor PUBLIC imgui)

# -----------------------------------------------------------------------------
# RtMidi
# -----------------------------------------------------------------------------
set(RTMIDI_BUILD_TESTING OFF CACHE INTERNAL "")
set(RTMIDI_BUILD_STATIC_LIBS ON CACHE INTERNAL "")
FetchContent_Declare(rtmidi
    GIT_REPOSITORY https://github.com/thestk/rtmidi.git
    GIT_TAG        6.0.0
    GIT_SHALLOW    TRUE
)
FetchContent_MakeAvailable(rtmidi)

# -----------------------------------------------------------------------------
# oscpack
#
# oscpack has no upstream CMakeLists; wrap the sources we need.
# -----------------------------------------------------------------------------
FetchContent_Declare(oscpack_src
    GIT_REPOSITORY https://github.com/RossBencina/oscpack.git
    GIT_TAG        master
    GIT_SHALLOW    TRUE
)
FetchContent_MakeAvailable(oscpack_src)

set(_oscpack_sources
    ${oscpack_src_SOURCE_DIR}/osc/OscOutboundPacketStream.cpp
    ${oscpack_src_SOURCE_DIR}/osc/OscPrintReceivedElements.cpp
    ${oscpack_src_SOURCE_DIR}/osc/OscReceivedElements.cpp
    ${oscpack_src_SOURCE_DIR}/osc/OscTypes.cpp
    ${oscpack_src_SOURCE_DIR}/ip/IpEndpointName.cpp
    ${oscpack_src_SOURCE_DIR}/ip/posix/NetworkingUtils.cpp
    ${oscpack_src_SOURCE_DIR}/ip/posix/UdpSocket.cpp
)
add_library(oscpack STATIC ${_oscpack_sources})
target_include_directories(oscpack SYSTEM PUBLIC ${oscpack_src_SOURCE_DIR})
target_compile_definitions(oscpack PUBLIC OSC_HOST_LITTLE_ENDIAN)

# -----------------------------------------------------------------------------
# GoogleTest (only when building tests)
# -----------------------------------------------------------------------------
if(SOUPMIX_BUILD_TESTS)
    set(BUILD_GMOCK OFF CACHE INTERNAL "")
    set(INSTALL_GTEST OFF CACHE INTERNAL "")
    FetchContent_Declare(googletest
        GIT_REPOSITORY https://github.com/google/googletest.git
        GIT_TAG        v1.14.0
        GIT_SHALLOW    TRUE
    )
    FetchContent_MakeAvailable(googletest)
endif()
