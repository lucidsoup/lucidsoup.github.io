#pragma once

#include <filesystem>

#include "soupmix/core/Result.hpp"

namespace soupmix::render { class Texture; }

namespace soupmix::io {

// Read pixels from the texture and write a PNG to disk.
[[nodiscard]] core::Result<void> writePng(const render::Texture& texture,
                                            const std::filesystem::path& path);

} // namespace soupmix::io
