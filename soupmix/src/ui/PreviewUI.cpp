#include "soupmix/ui/PreviewUI.hpp"

#include <imgui.h>

#include "soupmix/render/Texture.hpp"

namespace soupmix::ui {

void PreviewUI::draw(const render::Texture* output) {
    if (!ImGui::Begin("Preview")) { ImGui::End(); return; }

    if (!output) {
        ImGui::TextDisabled("No output yet.");
        ImGui::End();
        return;
    }

    const ImVec2 avail = ImGui::GetContentRegionAvail();
    const float  aspect = static_cast<float>(output->desc().width) /
                          static_cast<float>(output->desc().height);
    ImVec2 size = avail;
    if (avail.x / avail.y > aspect) size.x = avail.y * aspect;
    else                            size.y = avail.x / aspect;

    ImGui::Image(static_cast<ImTextureID>(static_cast<intptr_t>(output->id())), size,
                  ImVec2(0, 1), ImVec2(1, 0));
    ImGui::End();
}

} // namespace soupmix::ui
