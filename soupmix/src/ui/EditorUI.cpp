#include "soupmix/ui/EditorUI.hpp"

#include <imgui.h>
#include <backends/imgui_impl_glfw.h>
#include <backends/imgui_impl_opengl3.h>

#include "soupmix/debug/Log.hpp"
#include "soupmix/platform/Window.hpp"
#include "soupmix/ui/AssetBrowserUI.hpp"
#include "soupmix/ui/DockspaceUI.hpp"
#include "soupmix/ui/GraphEditorUI.hpp"
#include "soupmix/ui/InspectorUI.hpp"
#include "soupmix/ui/MappingUI.hpp"
#include "soupmix/ui/PerformanceUI.hpp"
#include "soupmix/ui/PreviewUI.hpp"
#include "soupmix/ui/Theme.hpp"

namespace soupmix::ui {

EditorUI::EditorUI()  = default;
EditorUI::~EditorUI() { shutdown(); }

core::Result<void> EditorUI::initialize(platform::Window& window) {
    IMGUI_CHECKVERSION();
    ImGui::CreateContext();

    ImGuiIO& io = ImGui::GetIO();
    io.ConfigFlags |= ImGuiConfigFlags_DockingEnable;
    io.ConfigFlags |= ImGuiConfigFlags_NavEnableKeyboard;

    applyDarkTheme();

    if (!ImGui_ImplGlfw_InitForOpenGL(window.handle(), true)) {
        return core::err(core::ErrorCode::Io, "ImGui_ImplGlfw_InitForOpenGL failed");
    }
    if (!ImGui_ImplOpenGL3_Init("#version 450")) {
        return core::err(core::ErrorCode::Io, "ImGui_ImplOpenGL3_Init failed");
    }

    dockspace_     = std::make_unique<DockspaceUI>();
    graph_editor_  = std::make_unique<GraphEditorUI>();
    inspector_     = std::make_unique<InspectorUI>();
    preview_       = std::make_unique<PreviewUI>();
    mapping_       = std::make_unique<MappingUI>();
    performance_   = std::make_unique<PerformanceUI>();
    asset_browser_ = std::make_unique<AssetBrowserUI>();

    initialized_ = true;
    return {};
}

void EditorUI::shutdown() {
    if (!initialized_) return;
    asset_browser_.reset();
    performance_.reset();
    mapping_.reset();
    preview_.reset();
    inspector_.reset();
    graph_editor_.reset();
    dockspace_.reset();
    ImGui_ImplOpenGL3_Shutdown();
    ImGui_ImplGlfw_Shutdown();
    ImGui::DestroyContext();
    initialized_ = false;
}

void EditorUI::beginFrame() {
    ImGui_ImplOpenGL3_NewFrame();
    ImGui_ImplGlfw_NewFrame();
    ImGui::NewFrame();
}

void EditorUI::draw(graph::Graph& graph,
                     const graph::NodeRegistry& registry,
                     project::Project* project) {
    dockspace_->draw();
    graph_editor_->draw(graph, registry);
    inspector_->draw(graph);
    preview_->draw(nullptr);
    mapping_->draw(project);
    performance_->draw(nullptr, nullptr);
    asset_browser_->draw(project);
}

void EditorUI::endFrame() {
    ImGui::Render();
    ImGui_ImplOpenGL3_RenderDrawData(ImGui::GetDrawData());
}

} // namespace soupmix::ui
