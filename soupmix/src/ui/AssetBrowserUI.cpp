#include "soupmix/ui/AssetBrowserUI.hpp"

#include <imgui.h>

#include "soupmix/project/Project.hpp"

namespace soupmix::ui {

void AssetBrowserUI::draw(project::Project* project) {
    if (!ImGui::Begin("Assets")) { ImGui::End(); return; }
    if (!project) {
        ImGui::TextDisabled("No project loaded.");
    } else {
        ImGui::TextDisabled("Asset browser placeholder.");
    }
    ImGui::End();
}

} // namespace soupmix::ui
