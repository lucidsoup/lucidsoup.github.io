#pragma once

#include "soupmix/core/Result.hpp"
#include "soupmix/graph/GraphCompiler.hpp"
#include "soupmix/graph/Node.hpp"

namespace soupmix::render { class Renderer; }

namespace soupmix::graph {

class Graph;

class GraphExecutor {
public:
    [[nodiscard]] core::Result<void> run(Graph&            graph,
                                          render::Renderer& renderer,
                                          const FrameContext& frame);

private:
    GraphCompiler        compiler_;
    render::RenderGraph  compiled_;
};

} // namespace soupmix::graph
