#pragma once

#include "soupmix/core/App.hpp"

namespace soupmix::app {

// Headless show mode: no editor UI, full-screen output for live performance.
class ShowApp {
public:
    explicit ShowApp(core::Config config);

    [[nodiscard]] int run();

private:
    core::App app_;
};

} // namespace soupmix::app
