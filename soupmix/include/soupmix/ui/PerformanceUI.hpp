#pragma once

namespace soupmix::debug { class Profiler; class GpuTimer; }

namespace soupmix::ui {

class PerformanceUI {
public:
    void draw(const debug::Profiler* cpu, const debug::GpuTimer* gpu);
};

} // namespace soupmix::ui
