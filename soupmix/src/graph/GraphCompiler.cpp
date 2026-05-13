#include "soupmix/graph/GraphCompiler.hpp"

#include "soupmix/graph/Graph.hpp"
#include "soupmix/graph/RenderRecorder.hpp"

namespace soupmix::graph {

core::Result<render::RenderGraph> GraphCompiler::compile(const Graph& graph) {
    render::RenderGraph out;
    // Real impl: topological sort, type check, texture pool allocation,
    // call each node's recordPasses, concatenate into out.passes.
    // Skeleton: produce an empty render graph so the executor compiles.
    last_generation_ = graph.generation();
    return out;
}

} // namespace soupmix::graph
