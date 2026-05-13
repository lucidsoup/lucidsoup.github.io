#include "soupmix/mapping/Projector.hpp"

#include "soupmix/platform/Window.hpp"

namespace soupmix::mapping {

Projector::Projector()  = default;
Projector::~Projector() { close(); }

core::Result<void> Projector::open() {
    output_window_ = std::make_unique<platform::Window>();
    platform::WindowConfig cfg;
    cfg.width  = window_.w;
    cfg.height = window_.h;
    cfg.title  = name_;
    cfg.decorated = false;
    return output_window_->create(cfg);
}

void Projector::close() {
    if (output_window_) {
        output_window_->destroy();
        output_window_.reset();
    }
}

void Projector::compose(render::Renderer& /*renderer*/, const render::Texture& /*content*/) {
    // Real impl: bind output_window_'s context, draw each surface in
    // layout_ as a fullscreen-warp pass sampling `content`, multiply by
    // blend masks, swap.
}

} // namespace soupmix::mapping
