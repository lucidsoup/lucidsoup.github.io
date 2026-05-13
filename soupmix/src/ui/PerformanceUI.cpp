#include "soupmix/ui/PerformanceUI.hpp"

#include <imgui.h>

#include "soupmix/debug/GpuTimer.hpp"
#include "soupmix/debug/Profiler.hpp"

namespace soupmix::ui {

void PerformanceUI::draw(const debug::Profiler* cpu, const debug::GpuTimer* gpu) {
    if (!ImGui::Begin("Performance")) { ImGui::End(); return; }

    const ImGuiIO& io = ImGui::GetIO();
    ImGui::Text("Frame: %.2f ms (%.0f FPS)", 1000.0f / io.Framerate, io.Framerate);
    ImGui::Separator();

    if (cpu) {
        ImGui::TextUnformatted("CPU samples:");
        for (const auto& s : cpu->lastFrame()) {
            ImGui::Text("%*s%s  %.2f ms", s.depth * 2, "", s.name.c_str(), s.end_ms - s.start_ms);
        }
    }
    if (gpu) {
        ImGui::TextUnformatted("GPU sections:");
        for (const auto& s : gpu->lastFrameSections()) {
            ImGui::Text("  %s  %.2f ms", s.name.c_str(), s.gpu_ms);
        }
    }

    ImGui::End();
}

} // namespace soupmix::ui
