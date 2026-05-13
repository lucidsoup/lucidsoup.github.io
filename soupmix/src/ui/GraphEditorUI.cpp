#include "soupmix/ui/GraphEditorUI.hpp"

#include <imgui.h>
#include <imgui_node_editor.h>

#include "soupmix/graph/Graph.hpp"
#include "soupmix/graph/NodeRegistry.hpp"

namespace ed = ax::NodeEditor;

namespace soupmix::ui {

GraphEditorUI::GraphEditorUI() {
    ed::Config cfg;
    cfg.SettingsFile = nullptr;
    ctx_ = ed::CreateEditor(&cfg);
}

GraphEditorUI::~GraphEditorUI() {
    if (ctx_) ed::DestroyEditor(ctx_);
}

void GraphEditorUI::draw(graph::Graph& graph, const graph::NodeRegistry& /*registry*/) {
    if (!ImGui::Begin("Graph")) { ImGui::End(); return; }

    ed::SetCurrentEditor(ctx_);
    ed::Begin("soupmix-graph-editor");

    // Real impl: walk graph.nodes(), call ed::BeginNode / pins / ed::EndNode
    // for each, draw links from graph.links(). Handle ed::QueryNewLink and
    // record edits onto a command buffer.
    (void)graph;

    ed::End();
    ed::SetCurrentEditor(nullptr);

    ImGui::End();
}

} // namespace soupmix::ui
