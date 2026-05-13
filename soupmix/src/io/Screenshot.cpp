#include "soupmix/io/Screenshot.hpp"

namespace soupmix::io {

core::Result<void> writePng(const render::Texture& /*texture*/,
                              const std::filesystem::path& /*path*/) {
    return core::err(core::ErrorCode::Unsupported, "writePng: not implemented");
}

} // namespace soupmix::io
