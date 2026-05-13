#pragma once

#include "soupmix/core/Result.hpp"

namespace soupmix::render {

// Loads OpenGL function pointers via glad and (optionally) installs a
// debug message callback. Call once after the first window context is
// made current.
[[nodiscard]] core::Result<void> initGL(bool enable_debug_callback);

} // namespace soupmix::render
