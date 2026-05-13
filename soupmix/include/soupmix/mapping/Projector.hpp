#pragma once

#include <memory>
#include <string>

#include "soupmix/core/UUID.hpp"
#include "soupmix/core/Result.hpp"
#include "soupmix/core/Types.hpp"
#include "soupmix/mapping/OutputLayout.hpp"

namespace soupmix::platform { class Window; }
namespace soupmix::render { class Renderer; class Texture; }

namespace soupmix::mapping {

struct WindowPlacement {
    i32 monitor = 0;
    i32 x = 0, y = 0;
    i32 w = 1920, h = 1080;
};

struct Viewport {
    i32 x = 0, y = 0;
    i32 w = 1920, h = 1080;
};

class Projector {
public:
    Projector();
    ~Projector();

    Projector(const Projector&)            = delete;
    Projector& operator=(const Projector&) = delete;

    [[nodiscard]] const core::UUID&    uuid()       const noexcept { return uuid_; }
    [[nodiscard]] const std::string&   name()       const noexcept { return name_; }
    [[nodiscard]] const WindowPlacement& window()   const noexcept { return window_; }
    [[nodiscard]] const Viewport&      viewport()   const noexcept { return viewport_; }
    [[nodiscard]] const OutputLayout&  layout()     const noexcept { return layout_; }
    [[nodiscard]] const core::UUID&    sourceNode() const noexcept { return source_node_; }

    [[nodiscard]] core::Result<void> open();
    void                             close();

    // Sample the texture through the configured surfaces and present.
    void compose(render::Renderer& renderer, const render::Texture& content);

    void setName(std::string n)            { name_ = std::move(n); }
    void setWindow(WindowPlacement p)      { window_ = p; }
    void setViewport(Viewport v)           { viewport_ = v; }
    void setLayout(OutputLayout l)         { layout_ = std::move(l); }
    void setSourceNode(core::UUID id)      { source_node_ = id; }

private:
    core::UUID                       uuid_;
    std::string                      name_;
    WindowPlacement                  window_;
    Viewport                         viewport_;
    OutputLayout                     layout_;
    core::UUID                       source_node_;
    std::unique_ptr<platform::Window> output_window_;
};

} // namespace soupmix::mapping
