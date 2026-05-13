#pragma once

#include <filesystem>
#include <vector>

#include "soupmix/core/Result.hpp"
#include "soupmix/core/Types.hpp"

namespace soupmix::io {

struct ImageData {
    i32                  width    = 0;
    i32                  height   = 0;
    i32                  channels = 4;
    std::vector<u8>      pixels;       // tightly packed RGBA8
};

[[nodiscard]] core::Result<ImageData> loadImage(const std::filesystem::path& path);

} // namespace soupmix::io
