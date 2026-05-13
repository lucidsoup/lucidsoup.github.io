#pragma once

#include <array>
#include <string>
#include <vector>

#include "soupmix/core/Types.hpp"

namespace soupmix::debug {

// Ring-buffered GPU timer using GL_TIMESTAMP queries.
class GpuTimer {
public:
    GpuTimer();
    ~GpuTimer();

    GpuTimer(const GpuTimer&)            = delete;
    GpuTimer& operator=(const GpuTimer&) = delete;

    void beginFrame();
    void endFrame();
    void beginSection(std::string name);
    void endSection();

    struct Section {
        std::string name;
        f64         gpu_ms = 0.0;
    };

    [[nodiscard]] const std::vector<Section>& lastFrameSections() const noexcept { return last_; }

private:
    static constexpr usize kRing = 3;
    std::vector<Section>   current_;
    std::vector<Section>   last_;
    std::array<u32, kRing> ring_{};   // GL query object names; managed in cpp
};

} // namespace soupmix::debug
