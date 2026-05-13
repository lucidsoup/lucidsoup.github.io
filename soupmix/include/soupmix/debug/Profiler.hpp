#pragma once

#include <chrono>
#include <string>
#include <vector>

#include "soupmix/core/Types.hpp"

namespace soupmix::debug {

// Cheap, hierarchical CPU profiler. One frame's worth of samples are
// recorded into a flat vector; the UI renders a flame graph from it.
struct ProfileSample {
    std::string name;
    f64         start_ms = 0.0;
    f64         end_ms   = 0.0;
    i32         depth    = 0;
};

class Profiler {
public:
    void  beginFrame();
    void  endFrame();
    void  push(std::string name);
    void  pop();

    [[nodiscard]] const std::vector<ProfileSample>& lastFrame() const noexcept { return last_; }

private:
    std::vector<ProfileSample> current_;
    std::vector<ProfileSample> last_;
    std::vector<usize>         stack_;
    i32                        depth_    = 0;
    f64                        frame_t0_ = 0.0;
};

class ScopedProfile {
public:
    ScopedProfile(Profiler& p, std::string name) : p_(p) { p_.push(std::move(name)); }
    ~ScopedProfile() { p_.pop(); }

private:
    Profiler& p_;
};

} // namespace soupmix::debug

#define SOUPMIX_PROFILE(profiler, name) \
    ::soupmix::debug::ScopedProfile soupmix_prof_##__LINE__((profiler), (name))
