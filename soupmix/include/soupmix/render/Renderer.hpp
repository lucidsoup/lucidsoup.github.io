#pragma once

#include <glm/vec4.hpp>

#include "soupmix/core/Result.hpp"
#include "soupmix/core/Types.hpp"

namespace soupmix::render {

struct RenderGraph;

class Renderer {
public:
    Renderer();
    ~Renderer();

    Renderer(const Renderer&)            = delete;
    Renderer& operator=(const Renderer&) = delete;

    [[nodiscard]] core::Result<void> initialize();
    void                             shutdown();

    void beginFrame(i32 width, i32 height);
    void endFrame();

    // Execute a pre-compiled render graph onto the currently bound
    // default framebuffer (or each pass's target, if set).
    void execute(const RenderGraph& graph);

    void clear(glm::vec4 color);

    [[nodiscard]] i32 frameWidth()  const noexcept { return width_;  }
    [[nodiscard]] i32 frameHeight() const noexcept { return height_; }

private:
    i32 width_  = 0;
    i32 height_ = 0;
};

} // namespace soupmix::render
