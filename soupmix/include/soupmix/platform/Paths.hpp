#pragma once

#include <filesystem>

namespace soupmix::platform {

// Directory the engine was launched from (where soupmix.exe lives).
[[nodiscard]] std::filesystem::path executableDir();

// Source-tree root, baked in at build time via SOUPMIX_SOURCE_ROOT.
// Used in development to locate shaders/assets without an install step.
[[nodiscard]] std::filesystem::path sourceRoot();

// Returns sourceRoot() / "shaders".
[[nodiscard]] std::filesystem::path shadersDir();

// Returns sourceRoot() / "assets".
[[nodiscard]] std::filesystem::path assetsDir();

// Per-user config dir ($XDG_CONFIG_HOME/soupmix on Linux).
[[nodiscard]] std::filesystem::path userConfigDir();

} // namespace soupmix::platform
