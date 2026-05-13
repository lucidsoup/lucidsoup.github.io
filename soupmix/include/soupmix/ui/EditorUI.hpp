#pragma once

#include <memory>

#include "soupmix/core/Result.hpp"

namespace soupmix::platform { class Window; }
namespace soupmix::graph    { class Graph; class NodeRegistry; }
namespace soupmix::project  { class Project; }

namespace soupmix::ui {

class DockspaceUI;
class GraphEditorUI;
class InspectorUI;
class PreviewUI;
class MappingUI;
class PerformanceUI;
class AssetBrowserUI;

// Root ImGui owner. Initializes the backend, owns each panel, and drives
// the per-frame begin/draw/end cycle.
class EditorUI {
public:
    EditorUI();
    ~EditorUI();

    EditorUI(const EditorUI&)            = delete;
    EditorUI& operator=(const EditorUI&) = delete;

    [[nodiscard]] core::Result<void> initialize(platform::Window& window);
    void                             shutdown();

    void beginFrame();
    void draw(graph::Graph& graph,
              const graph::NodeRegistry& registry,
              project::Project* project);
    void endFrame();

private:
    bool                                initialized_ = false;
    std::unique_ptr<DockspaceUI>        dockspace_;
    std::unique_ptr<GraphEditorUI>      graph_editor_;
    std::unique_ptr<InspectorUI>        inspector_;
    std::unique_ptr<PreviewUI>          preview_;
    std::unique_ptr<MappingUI>          mapping_;
    std::unique_ptr<PerformanceUI>      performance_;
    std::unique_ptr<AssetBrowserUI>     asset_browser_;
};

} // namespace soupmix::ui
