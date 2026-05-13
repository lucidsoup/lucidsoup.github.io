#include "soupmix/ui/Theme.hpp"

#include <imgui.h>

namespace soupmix::ui {

void applyDarkTheme() {
    ImGui::StyleColorsDark();
    auto& s = ImGui::GetStyle();
    s.WindowRounding    = 4.0f;
    s.FrameRounding     = 3.0f;
    s.GrabRounding      = 3.0f;
    s.ScrollbarRounding = 3.0f;
    s.TabRounding       = 3.0f;
    s.WindowPadding     = ImVec2(8, 8);
    s.FramePadding      = ImVec2(6, 4);
    s.ItemSpacing       = ImVec2(8, 4);
}

} // namespace soupmix::ui
