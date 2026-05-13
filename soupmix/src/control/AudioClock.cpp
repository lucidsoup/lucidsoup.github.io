#include "soupmix/control/AudioClock.hpp"

#include "soupmix/core/Time.hpp"

namespace soupmix::control {

AudioClock::AudioClock()  = default;
AudioClock::~AudioClock() = default;

void AudioClock::tick(f32 dt_seconds) {
    const f32 bpm        = bpm_.load(std::memory_order_relaxed);
    const f32 beats_per_s = bpm / 60.0f;
    f32       phase      = phase_.load(std::memory_order_relaxed);
    u32       beat       = beat_.load(std::memory_order_relaxed);

    phase += dt_seconds * beats_per_s;
    while (phase >= 1.0f) {
        phase -= 1.0f;
        ++beat;
    }
    phase_.store(phase, std::memory_order_relaxed);
    beat_.store(beat,   std::memory_order_relaxed);
}

void AudioClock::tap() {
    const f64 now = core::nowSeconds();
    if (last_tap_ > 0.0) {
        const f64 dt = now - last_tap_;
        if (dt > 0.05 && dt < 3.0) {
            bpm_.store(static_cast<f32>(60.0 / dt), std::memory_order_relaxed);
        }
    }
    last_tap_ = now;
}

void AudioClock::setBpm(f32 bpm) {
    bpm_.store(bpm, std::memory_order_relaxed);
}

} // namespace soupmix::control
