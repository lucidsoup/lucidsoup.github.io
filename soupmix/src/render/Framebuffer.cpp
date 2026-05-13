#include "soupmix/render/Framebuffer.hpp"

#include <glad/gl.h>

#include <utility>
#include <vector>

namespace soupmix::render {

Framebuffer::~Framebuffer() { destroy(); }
Framebuffer::Framebuffer(Framebuffer&& o) noexcept
    : fbo_(o.fbo_), desc_(o.desc_), colors_(std::move(o.colors_)), depth_(std::move(o.depth_)), has_ds_(o.has_ds_) {
    o.fbo_ = 0; o.has_ds_ = false;
}
Framebuffer& Framebuffer::operator=(Framebuffer&& o) noexcept {
    if (this != &o) {
        destroy();
        fbo_    = o.fbo_;
        desc_   = o.desc_;
        colors_ = std::move(o.colors_);
        depth_  = std::move(o.depth_);
        has_ds_ = o.has_ds_;
        o.fbo_  = 0;
        o.has_ds_ = false;
    }
    return *this;
}

core::Result<void> Framebuffer::create(const FramebufferDesc& d) {
    destroy();
    desc_ = d;
    glCreateFramebuffers(1, &fbo_);

    colors_.resize(d.color.size());
    std::vector<GLenum> draw_buffers;
    draw_buffers.reserve(d.color.size());
    for (usize i = 0; i < d.color.size(); ++i) {
        TextureDesc td;
        td.width  = d.width;
        td.height = d.height;
        td.format = d.color[i].format;
        td.min_filter = d.color[i].filter;
        td.mag_filter = d.color[i].filter;
        if (auto r = colors_[i].create(td); !r) return r.error();
        const GLenum slot = GL_COLOR_ATTACHMENT0 + static_cast<GLuint>(i);
        glNamedFramebufferTexture(fbo_, slot, colors_[i].id(), 0);
        draw_buffers.push_back(slot);
    }
    if (!draw_buffers.empty()) {
        glNamedFramebufferDrawBuffers(fbo_, static_cast<GLsizei>(draw_buffers.size()), draw_buffers.data());
    }

    if (d.depth_stencil) {
        TextureDesc td;
        td.width  = d.width;
        td.height = d.height;
        td.format = TextureFormat::Depth24Stencil8;
        if (auto r = depth_.create(td); !r) return r.error();
        glNamedFramebufferTexture(fbo_, GL_DEPTH_STENCIL_ATTACHMENT, depth_.id(), 0);
        has_ds_ = true;
    }

    if (glCheckNamedFramebufferStatus(fbo_, GL_FRAMEBUFFER) != GL_FRAMEBUFFER_COMPLETE) {
        return core::err(core::ErrorCode::InvalidState, "framebuffer incomplete");
    }
    return {};
}

void Framebuffer::destroy() {
    if (fbo_) { glDeleteFramebuffers(1, &fbo_); fbo_ = 0; }
    colors_.clear();
    depth_.destroy();
    has_ds_ = false;
}

void Framebuffer::resize(i32 w, i32 h) {
    if (w == desc_.width && h == desc_.height) return;
    FramebufferDesc d = desc_;
    d.width  = w;
    d.height = h;
    (void)create(d);
}

void Framebuffer::bind()   const { glBindFramebuffer(GL_FRAMEBUFFER, fbo_); }
void Framebuffer::unbind() const { glBindFramebuffer(GL_FRAMEBUFFER, 0); }

} // namespace soupmix::render
