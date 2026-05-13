#include "soupmix/app/CommandLine.hpp"

#include <cstdio>
#include <cstring>
#include <string_view>

namespace soupmix::app {

core::Result<ParsedCommandLine> parseCommandLine(int argc, char** argv) {
    ParsedCommandLine out;

    for (int i = 1; i < argc; ++i) {
        std::string_view a = argv[i];
        if (a == "-h" || a == "--help") {
            out.print_help = true;
        } else if (a == "--version") {
            out.print_version = true;
        } else if (a == "--show") {
            out.show_mode = true;
        } else if (a == "--project" && i + 1 < argc) {
            out.config.project_path = argv[++i];
        } else if (a == "--width" && i + 1 < argc) {
            out.config.window_width = std::atoi(argv[++i]);
        } else if (a == "--height" && i + 1 < argc) {
            out.config.window_height = std::atoi(argv[++i]);
        } else if (a == "--no-vsync") {
            out.config.vsync = false;
        } else if (a == "--no-midi") {
            out.config.enable_midi = false;
        } else if (a == "--no-osc") {
            out.config.enable_osc = false;
        } else {
            return core::err(core::ErrorCode::InvalidArgument,
                              "unknown argument: " + std::string(a));
        }
    }
    return out;
}

void printHelp(const char* program_name) {
    std::printf(
        "Usage: %s [options]\n"
        "  --project <dir>    Open project at <dir>\n"
        "  --show             Run in headless show mode (no editor UI)\n"
        "  --width  <px>      Editor window width  (default 1600)\n"
        "  --height <px>      Editor window height (default  900)\n"
        "  --no-vsync         Disable vsync\n"
        "  --no-midi          Disable MIDI subsystem\n"
        "  --no-osc           Disable OSC subsystem\n"
        "  -h, --help         Show this message\n"
        "  --version          Show version\n",
        program_name);
}

} // namespace soupmix::app
