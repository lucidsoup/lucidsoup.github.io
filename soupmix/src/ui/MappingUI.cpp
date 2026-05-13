#include "soupmix/ui/MappingUI.hpp"

#include <imgui.h>

#include "soupmix/project/Project.hpp"

namespace soupmix::ui {

void MappingUI::draw(project::Project* project) {
    if (!ImGui::Begin("Mapping")) { ImGui::End(); return; }

    if (!project) {
        ImGui::TextDisabled("No project loaded.");
        ImGui::End();
        return;
    }

    ImGui::Text("Surfaces:   %zu", project->surfaces().size());
    ImGui::Text("Projectors: %zu", project->projectors().size());
    ImGui::Separator();
    ImGui::TextDisabled("Mapping canvas not yet implemented.");

    ImGui::End();
}

} // namespace soupmix::ui
