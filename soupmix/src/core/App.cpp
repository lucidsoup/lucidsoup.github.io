#include "soupmix/core/App.hpp"

#include <glad/gl.h>
#include <GLFW/glfw3.h>

#include "soupmix/debug/Log.hpp"
#include "soupmix/graph/Graph.hpp"
#include "soupmix/graph/NodeRegistry.hpp"
#include "soupmix/platform/Window.hpp"
#include "soupmix/render/GLContext.hpp"
#include "soupmix/render/Renderer.hpp"
#include "soupmix/ui/EditorUI.hpp"

namespace soupmix::core {

App::App(Config config) : config_(std::move(config)) {}
App::~App() { shutdown(); }

Result<void> App::initialize() {
    window_ = std::make_unique<platform::Window>();
    platform::WindowConfig wc{
        .width  = config_.window_width,
        .height = config_.window_height,
        .title  = config_.window_title,
        .vsync  = config_.vsync,
    };
    if (auto r = window_->create(wc); !r) return r.error();

    if (auto r = render::initGL(config_.gl_debug_callback); !r) return r.error();

    renderer_ = std::make_unique<render::Renderer>();
    if (auto r = renderer_->initialize(); !r) return r.error();

    node_registry_ = std::make_unique<graph::NodeRegistry>();
    graph::registerBuiltinNodes(*node_registry_);

    graph_ = std::make_unique<graph::Graph>();

    ui_ = std::make_unique<ui::EditorUI>();
    if (auto r = ui_->initialize(*window_); !r) return r.error();

    services_.provide<platform::Window>(window_.get());
    services_.provide<render::Renderer>(renderer_.get());
    services_.provide<graph::NodeRegistry>(node_registry_.get());
    services_.provide<graph::Graph>(graph_.get());
    services_.provide<ui::EditorUI>(ui_.get());

    initialized_ = true;
    SOUPMIX_INFO("soupmix initialized ({}x{})", config_.window_width, config_.window_height);
    return {};
}

void App::run() {
    if (!initialized_) {
        SOUPMIX_ERROR("App::run called before initialize");
        return;
    }
    running_ = true;
    while (running_ && !window_->shouldClose()) {
        tick();
    }
}

void App::tick() {
    window_->pollEvents();
    timer_.tick();

    renderer_->beginFrame(window_->width(), window_->height());
    renderer_->clear({0.05f, 0.06f, 0.08f, 1.0f});

    ui_->beginFrame();
    ui_->draw(*graph_, *node_registry_, nullptr);
    ui_->endFrame();

    renderer_->endFrame();
    window_->swapBuffers();
}

void App::shutdown() {
    if (!initialized_) return;
    services_.clear();
    ui_.reset();
    graph_.reset();
    node_registry_.reset();
    if (renderer_) renderer_->shutdown();
    renderer_.reset();
    if (window_) window_->destroy();
    window_.reset();
    initialized_ = false;
    SOUPMIX_INFO("soupmix shut down");
}

} // namespace soupmix::core
