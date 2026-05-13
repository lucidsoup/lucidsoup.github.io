#pragma once

#include <filesystem>
#include <memory>

#include "soupmix/core/Result.hpp"
#include "soupmix/core/Types.hpp"

namespace soupmix::render { class Texture; }

namespace soupmix::io {

// Streams a video file as a sequence of textures on a worker thread.
// Backed by FFmpeg in a future implementation; this header defines the
// interface so node code can be written against it now.
class VideoDecoder {
public:
    VideoDecoder();
    ~VideoDecoder();

    VideoDecoder(const VideoDecoder&)            = delete;
    VideoDecoder& operator=(const VideoDecoder&) = delete;

    [[nodiscard]] core::Result<void> open(const std::filesystem::path& path);
    void                             close();

    void play();
    void pause();
    void seekSeconds(f64 t);

    // Upload the latest available frame into `target` (created if needed).
    // Returns true when the texture was updated this call.
    [[nodiscard]] bool uploadLatest(render::Texture& target);

    [[nodiscard]] f64 durationSeconds() const noexcept { return duration_; }
    [[nodiscard]] f64 positionSeconds() const noexcept { return position_; }

private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
    f64                   duration_ = 0.0;
    f64                   position_ = 0.0;
};

} // namespace soupmix::io
