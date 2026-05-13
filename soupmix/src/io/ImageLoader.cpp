#include "soupmix/io/ImageLoader.hpp"

namespace soupmix::io {

core::Result<ImageData> loadImage(const std::filesystem::path& /*path*/) {
    // Real impl uses stb_image (vendored next to imgui via FetchContent).
    return core::err(core::ErrorCode::Unsupported, "ImageLoader: not implemented");
}

} // namespace soupmix::io
