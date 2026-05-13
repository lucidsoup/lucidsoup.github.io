#pragma once

#include <filesystem>
#include <string>
#include <vector>

#include "soupmix/core/Result.hpp"

namespace soupmix::platform {

[[nodiscard]] core::Result<std::string>          readTextFile(const std::filesystem::path& path);
[[nodiscard]] core::Result<std::vector<unsigned char>> readBinaryFile(const std::filesystem::path& path);
[[nodiscard]] core::Result<void>                 writeTextFile(const std::filesystem::path& path, std::string_view text);

[[nodiscard]] bool                               fileExists(const std::filesystem::path& path);
[[nodiscard]] core::Result<void>                 ensureDirectory(const std::filesystem::path& path);

} // namespace soupmix::platform
