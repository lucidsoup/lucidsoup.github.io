#pragma once

#include "soupmix/core/App.hpp"

namespace soupmix::app {

// Editor entry point: window + ImGui editor + live render.
class EditorApp {
public:
    explicit EditorApp(core::Config config);

    [[nodiscard]] int run();

private:
    core::App app_;
};

} // namespace soupmix::app
