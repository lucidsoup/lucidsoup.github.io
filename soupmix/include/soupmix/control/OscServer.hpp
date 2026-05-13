#pragma once

#include <memory>
#include <string>
#include <vector>

#include "soupmix/core/Result.hpp"
#include "soupmix/core/Types.hpp"

namespace soupmix::control {

struct OscArg {
    enum class Type : u8 { Int, Float, String, Bool };
    Type        type  = Type::Float;
    i32         i     = 0;
    f32         f     = 0.0f;
    std::string s;
    bool        b     = false;
};

struct OscMessage {
    std::string         address;
    std::vector<OscArg> args;
};

class OscServer {
public:
    OscServer();
    ~OscServer();

    OscServer(const OscServer&)            = delete;
    OscServer& operator=(const OscServer&) = delete;

    [[nodiscard]] core::Result<void> start(i32 port);
    void                             stop();

    // Drain inbound messages. Called once per frame from the render thread.
    [[nodiscard]] std::vector<OscMessage> drain();

private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};

} // namespace soupmix::control
