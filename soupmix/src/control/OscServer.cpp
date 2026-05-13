#include "soupmix/control/OscServer.hpp"

namespace soupmix::control {

struct OscServer::Impl {
    // Real impl spins up a worker thread running an
    // osc::UdpListeningReceiveSocket bound to `port`, decodes packets via
    // osc::OscReceivedMessage, and pushes OscMessage values onto a
    // lock-free queue drained by drain(). Headers / library are wired
    // through cmake/Dependencies.cmake (oscpack target).
};

OscServer::OscServer()  = default;
OscServer::~OscServer() { stop(); }

core::Result<void> OscServer::start(i32 /*port*/) {
    impl_ = std::make_unique<Impl>();
    return {};
}

void OscServer::stop() {
    impl_.reset();
}

std::vector<OscMessage> OscServer::drain() {
    return {};
}

} // namespace soupmix::control
