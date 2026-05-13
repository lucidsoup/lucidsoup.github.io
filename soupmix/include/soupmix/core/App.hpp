#pragma once

#include <memory>

#include "soupmix/core/Config.hpp"
#include "soupmix/core/Result.hpp"
#include "soupmix/core/ServiceLocator.hpp"
#include "soupmix/core/Time.hpp"

namespace soupmix::platform { class Window; }
namespace soupmix::render   { class Renderer; }
namespace soupmix::graph    { class Graph; class NodeRegistry; }
namespace soupmix::ui       { class EditorUI; }

namespace soupmix::core {

class App {
public:
    explicit App(Config config);
    ~App();

    App(const App&)            = delete;
    App& operator=(const App&) = delete;

    [[nodiscard]] Result<void> initialize();
    void                       run();             // blocks until window close
    void                       shutdown();

    [[nodiscard]] ServiceLocator&       services()       noexcept { return services_; }
    [[nodiscard]] const ServiceLocator& services() const noexcept { return services_; }
    [[nodiscard]] const Config&         config()   const noexcept { return config_; }

private:
    void tick();

    Config           config_;
    FrameTimer       timer_;
    ServiceLocator   services_;

    std::unique_ptr<platform::Window>      window_;
    std::unique_ptr<render::Renderer>      renderer_;
    std::unique_ptr<graph::NodeRegistry>   node_registry_;
    std::unique_ptr<graph::Graph>          graph_;
    std::unique_ptr<ui::EditorUI>          ui_;

    bool initialized_ = false;
    bool running_     = false;
};

} // namespace soupmix::core
