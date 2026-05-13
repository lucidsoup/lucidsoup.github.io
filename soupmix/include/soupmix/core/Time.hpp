#pragma once

#include "soupmix/core/Types.hpp"

namespace soupmix::core {

// Monotonic wall-clock time in seconds since engine start.
[[nodiscard]] f64 nowSeconds() noexcept;

class FrameTimer {
public:
    FrameTimer();

    // Call once per frame. Updates dt() and totalSeconds().
    void tick();

    [[nodiscard]] f32 dt()           const noexcept { return dt_; }
    [[nodiscard]] f64 totalSeconds() const noexcept { return total_; }
    [[nodiscard]] u64 frame()        const noexcept { return frame_; }

private:
    f64 last_  = 0.0;
    f64 total_ = 0.0;
    f32 dt_    = 0.0f;
    u64 frame_ = 0;
};

} // namespace soupmix::core
