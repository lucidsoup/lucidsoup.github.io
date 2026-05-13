#include "soupmix/graph/GraphExecutor.hpp"

#include "soupmix/graph/Graph.hpp"
#include "soupmix/render/Renderer.hpp"

namespace soupmix::graph {

core::Result<void> GraphExecutor::run(Graph&            graph,
                                       render::Renderer& renderer,
                                       const FrameContext& /*frame*/) {
    if (compiler_.lastGeneration() != graph.generation()) {
        auto r = compiler_.compile(graph);
        if (!r) return r.error();
        compiled_ = std::move(r.value());
    }
    renderer.execute(compiled_);
    return {};
}

} // namespace soupmix::graph
