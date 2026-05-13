#include "soupmix/io/VideoDecoder.hpp"

namespace soupmix::io {

struct VideoDecoder::Impl {
    // FFmpeg-backed decoder thread state goes here.
};

VideoDecoder::VideoDecoder()  = default;
VideoDecoder::~VideoDecoder() { close(); }

core::Result<void> VideoDecoder::open(const std::filesystem::path& /*path*/) {
    impl_ = std::make_unique<Impl>();
    return {};
}

void VideoDecoder::close() {
    impl_.reset();
    duration_ = 0.0;
    position_ = 0.0;
}

void VideoDecoder::play() {}
void VideoDecoder::pause() {}
void VideoDecoder::seekSeconds(f64 t) { position_ = t; }

bool VideoDecoder::uploadLatest(render::Texture& /*target*/) { return false; }

} // namespace soupmix::io
