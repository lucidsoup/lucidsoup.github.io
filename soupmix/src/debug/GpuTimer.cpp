#include "soupmix/debug/GpuTimer.hpp"

namespace soupmix::debug {

// Real GL_TIMESTAMP query handling is implemented when the render
// pipeline is wired up. For now the timer accepts begin/end calls and
// records zero-cost samples so call sites compile and the perf UI has a
// stable shape.

GpuTimer::GpuTimer()  = default;
GpuTimer::~GpuTimer() = default;

void GpuTimer::beginFrame() { current_.clear(); }
void GpuTimer::endFrame()   { last_ = std::move(current_); }

void GpuTimer::beginSection(std::string name) {
    current_.push_back(Section{std::move(name), 0.0});
}

void GpuTimer::endSection() {
    // Real impl issues a GL_TIMESTAMP query and resolves it next frame.
}

} // namespace soupmix::debug
