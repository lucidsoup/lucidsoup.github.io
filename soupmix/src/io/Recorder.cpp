#include "soupmix/io/Recorder.hpp"

namespace soupmix::io {

struct Recorder::Impl {
    // FFmpeg encoder thread state goes here.
};

Recorder::Recorder()  = default;
Recorder::~Recorder() { stop(); }

core::Result<void> Recorder::start(const std::filesystem::path& /*path*/, i32 /*fps*/) {
    impl_   = std::make_unique<Impl>();
    active_ = true;
    return {};
}

void Recorder::stop() {
    active_ = false;
    impl_.reset();
}

void Recorder::appendFrame(const render::Texture& /*texture*/) {}

} // namespace soupmix::io
