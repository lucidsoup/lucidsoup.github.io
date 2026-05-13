#include "soupmix/ui/InspectorUI.hpp"

#include <imgui.h>

#include "soupmix/graph/Graph.hpp"

namespace soupmix::ui {

void InspectorUI::draw(graph::Graph& /*graph*/) {
    if (!ImGui::Begin("Inspector")) { ImGui::End(); return; }

    if (!selected_) {
        ImGui::TextDisabled("No node selected.");
        ImGui::End();
        return;
    }

    ImGui::TextUnformatted(selected_->label().c_str());
    ImGui::Separator();

    for (auto& p : selected_->parameters()) {
        switch (p.type) {
            case graph::ParamType::Float:
                ImGui::SliderFloat(p.display_name.c_str(), &p.v_float,
                                    p.range.min, p.range.max);
                break;
            case graph::ParamType::Int:
                ImGui::DragInt(p.display_name.c_str(), &p.v_int);
                break;
            case graph::ParamType::Bool:
                ImGui::Checkbox(p.display_name.c_str(), &p.v_bool);
                break;
            case graph::ParamType::Color:
                ImGui::ColorEdit4(p.display_name.c_str(), &p.v_vec4.x);
                break;
            case graph::ParamType::Vec2:
                ImGui::DragFloat2(p.display_name.c_str(), &p.v_vec2.x);
                break;
            case graph::ParamType::Vec3:
                ImGui::DragFloat3(p.display_name.c_str(), &p.v_vec3.x);
                break;
            case graph::ParamType::Vec4:
                ImGui::DragFloat4(p.display_name.c_str(), &p.v_vec4.x);
                break;
            default:
                ImGui::TextDisabled("(unsupported param type)");
                break;
        }
    }

    ImGui::End();
}

} // namespace soupmix::ui
