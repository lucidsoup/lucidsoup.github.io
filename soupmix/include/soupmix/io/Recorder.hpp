#pragma once

#include <filesystem>
#include <memory>

#include "soupmix/core/Result.hpp"
#include "soupmix/core/Types.hpp"

namespace soupmix::render { class Texture; }

namespace soupmix::io {

class Recorder {
public:
    Recorder();
    ~Recorder();

    Recorder(const Recorder&)            = delete;
    Recorder& operator=(const Recorder&) = delete;

    [[nodiscard]] core::Result<void> start(const std::filesystem::path& path, i32 fps = 60);
    void                             stop();

    void appendFrame(const render::Texture& texture);

    [[nodiscard]] bool active() const noexcept { return active_; }

private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
    bool                  active_ = false;
};

} // namespace soupmix::io
