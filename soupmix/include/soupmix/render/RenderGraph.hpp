#pragma once

#include <vector>

#include "soupmix/render/DrawPass.hpp"

namespace soupmix::render {

// Compiled, immutable representation of one frame's worth of GPU work.
// Produced by graph::GraphCompiler, consumed by graph::GraphExecutor.
struct RenderGraph {
    std::vector<DrawPass> passes;

    void clear() { passes.clear(); }
};

} // namespace soupmix::render
