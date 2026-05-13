#pragma once

#include <filesystem>
#include <string>

namespace soupmix::core {

struct Config {
    // Window
    int         window_width  = 1600;
    int         window_height = 900;
    std::string window_title  = "soupmix";
    bool        vsync         = true;

    // Paths
    std::filesystem::path project_path;   // optional, --project <dir>

    // Rendering
    int  target_fps        = 60;
    bool gl_debug_callback = true;

    // Control
    bool enable_midi = true;
    bool enable_osc  = true;
    int  osc_port    = 9000;
};

} // namespace soupmix::core
