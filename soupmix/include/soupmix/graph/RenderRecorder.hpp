#pragma once

#include "soupmix/render/DrawPass.hpp"
#include "soupmix/render/RenderGraph.hpp"

namespace soupmix::graph {

// Passed to Node::recordPasses(). Nodes append DrawPass values; the
// compiler later concatenates the per-node recorders into a single
// RenderGraph.
class RenderRecorder {
public:
    void append(render::DrawPass pass) { passes_.push_back(std::move(pass)); }

    [[nodiscard]] render::DrawList&       passes()       noexcept { return passes_; }
    [[nodiscard]] const render::DrawList& passes() const noexcept { return passes_; }

private:
    render::DrawList passes_;
};

} // namespace soupmix::graph
