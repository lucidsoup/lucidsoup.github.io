#include "soupmix/core/Time.hpp"

#include <chrono>

namespace soupmix::core {

namespace {
const auto kStart = std::chrono::steady_clock::now();
}

f64 nowSeconds() noexcept {
    const auto now = std::chrono::steady_clock::now();
    const auto ns  = std::chrono::duration_cast<std::chrono::nanoseconds>(now - kStart).count();
    return static_cast<f64>(ns) / 1.0e9;
}

FrameTimer::FrameTimer() : last_(nowSeconds()) {}

void FrameTimer::tick() {
    const f64 now = nowSeconds();
    const f64 dt  = now - last_;
    last_  = now;
    total_ = now;
    dt_    = static_cast<f32>(dt);
    ++frame_;
}

} // namespace soupmix::core
