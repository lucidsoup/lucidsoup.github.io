#include "soupmix/app/ShowApp.hpp"

#include <cstdlib>

#include "soupmix/debug/Log.hpp"

namespace soupmix::app {

ShowApp::ShowApp(core::Config config) : app_(std::move(config)) {}

int ShowApp::run() {
    if (auto r = app_.initialize(); !r) {
        SOUPMIX_ERROR("init failed: {}", r.error().message);
        return EXIT_FAILURE;
    }
    app_.run();
    app_.shutdown();
    return EXIT_SUCCESS;
}

} // namespace soupmix::app
