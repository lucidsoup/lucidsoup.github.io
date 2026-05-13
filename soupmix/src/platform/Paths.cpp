#include "soupmix/platform/Paths.hpp"

#include <cstdlib>

#ifndef SOUPMIX_SOURCE_ROOT
#define SOUPMIX_SOURCE_ROOT "."
#endif

namespace soupmix::platform {

std::filesystem::path executableDir() {
    return std::filesystem::current_path();
}

std::filesystem::path sourceRoot() {
    return std::filesystem::path(SOUPMIX_SOURCE_ROOT);
}

std::filesystem::path shadersDir() { return sourceRoot() / "shaders"; }
std::filesystem::path assetsDir()  { return sourceRoot() / "assets";  }

std::filesystem::path userConfigDir() {
    if (const char* xdg = std::getenv("XDG_CONFIG_HOME")) {
        return std::filesystem::path(xdg) / "soupmix";
    }
    if (const char* home = std::getenv("HOME")) {
        return std::filesystem::path(home) / ".config" / "soupmix";
    }
    return std::filesystem::current_path() / ".soupmix";
}

} // namespace soupmix::platform
