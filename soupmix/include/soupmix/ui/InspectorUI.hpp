#pragma once

namespace soupmix::graph { class Graph; class Node; }

namespace soupmix::ui {

class InspectorUI {
public:
    void draw(graph::Graph& graph);

    void setSelected(graph::Node* node) { selected_ = node; }

private:
    graph::Node* selected_ = nullptr;
};

} // namespace soupmix::ui
