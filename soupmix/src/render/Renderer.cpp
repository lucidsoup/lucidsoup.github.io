#include "soupmix/render/Renderer.hpp"

#include <glad/gl.h>

#include "soupmix/render/RenderGraph.hpp"

namespace soupmix::render {

Renderer::Renderer()  = default;
Renderer::~Renderer() { shutdown(); }

core::Result<void> Renderer::initialize() {
    return {};
}

void Renderer::shutdown() {}

void Renderer::beginFrame(i32 width, i32 height) {
    width_  = width;
    height_ = height;
    glViewport(0, 0, width, height);
}

void Renderer::endFrame() {}

void Renderer::clear(glm::vec4 c) {
    glClearColor(c.r, c.g, c.b, c.a);
    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT | GL_STENCIL_BUFFER_BIT);
}

void Renderer::execute(const RenderGraph& graph) {
    // Real pass replay lives here once the node implementations exist.
    // For now we just walk the list so call sites compile.
    for (const auto& pass : graph.passes) {
        (void)pass;
    }
}

} // namespace soupmix::render
