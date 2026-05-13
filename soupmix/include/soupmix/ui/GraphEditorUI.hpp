#pragma once

#include <memory>

namespace ax::NodeEditor { struct EditorContext; }
namespace soupmix::graph { class Graph; class NodeRegistry; }

namespace soupmix::ui {

class GraphEditorUI {
public:
    GraphEditorUI();
    ~GraphEditorUI();

    GraphEditorUI(const GraphEditorUI&)            = delete;
    GraphEditorUI& operator=(const GraphEditorUI&) = delete;

    void draw(graph::Graph& graph, const graph::NodeRegistry& registry);

private:
    ax::NodeEditor::EditorContext* ctx_ = nullptr;
};

} // namespace soupmix::ui
