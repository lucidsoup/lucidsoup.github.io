#pragma once

#include "soupmix/core/Result.hpp"
#include "soupmix/render/RenderGraph.hpp"

namespace soupmix::graph {

class Graph;

class GraphCompiler {
public:
    [[nodiscard]] core::Result<render::RenderGraph> compile(const Graph& graph);

    // Compile cache invalidation marker. The executor checks this against
    // the Graph::generation() to decide whether to recompile.
    [[nodiscard]] u64 lastGeneration() const noexcept { return last_generation_; }

private:
    u64 last_generation_ = static_cast<u64>(-1);
};

} // namespace soupmix::graph
