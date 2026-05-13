#include "soupmix/debug/Profiler.hpp"

#include "soupmix/core/Time.hpp"

namespace soupmix::debug {

void Profiler::beginFrame() {
    current_.clear();
    stack_.clear();
    depth_    = 0;
    frame_t0_ = core::nowSeconds();
}

void Profiler::endFrame() {
    last_ = std::move(current_);
    current_.clear();
}

void Profiler::push(std::string name) {
    const f64 t = (core::nowSeconds() - frame_t0_) * 1000.0;
    ProfileSample s;
    s.name     = std::move(name);
    s.start_ms = t;
    s.depth    = depth_++;
    current_.push_back(std::move(s));
    stack_.push_back(current_.size() - 1);
}

void Profiler::pop() {
    if (stack_.empty()) return;
    const usize idx = stack_.back();
    stack_.pop_back();
    current_[idx].end_ms = (core::nowSeconds() - frame_t0_) * 1000.0;
    --depth_;
}

} // namespace soupmix::debug
