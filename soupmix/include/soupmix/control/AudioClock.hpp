#pragma once

#include <atomic>

#include "soupmix/core/Types.hpp"

namespace soupmix::control {

// Drives beat-synchronized animation. Sources, in priority order:
//   1. external MIDI clock (24 ppqn) if connected,
//   2. tap tempo,
//   3. fixed BPM.
//
// Values are mirrored into atomics so any thread can sample current
// phase without locking.
class AudioClock {
public:
    AudioClock();
    ~AudioClock();

    void tick(f32 dt_seconds);
    void tap();                          // call from UI/MIDI tap

    void setBpm(f32 bpm);
    [[nodiscard]] f32 bpm()         const noexcept { return bpm_.load(std::memory_order_relaxed); }
    [[nodiscard]] f32 phase()       const noexcept { return phase_.load(std::memory_order_relaxed); }
    [[nodiscard]] u32 beatCounter() const noexcept { return beat_.load(std::memory_order_relaxed); }

private:
    std::atomic<f32> bpm_   {120.0f};
    std::atomic<f32> phase_ {0.0f};
    std::atomic<u32> beat_  {0};
    f64              last_tap_ = 0.0;
};

} // namespace soupmix::control
