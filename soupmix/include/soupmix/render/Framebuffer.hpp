#pragma once

#include <vector>

#include "soupmix/core/Result.hpp"
#include "soupmix/render/Texture.hpp"

namespace soupmix::render {

struct AttachmentDesc {
    TextureFormat format = TextureFormat::RGBA8;
    FilterMode    filter = FilterMode::Linear;
};

struct FramebufferDesc {
    i32                          width  = 0;
    i32                          height = 0;
    std::vector<AttachmentDesc>  color;
    bool                         depth_stencil = false;
};

class Framebuffer {
public:
    Framebuffer() = default;
    ~Framebuffer();

    Framebuffer(const Framebuffer&)            = delete;
    Framebuffer& operator=(const Framebuffer&) = delete;
    Framebuffer(Framebuffer&&) noexcept;
    Framebuffer& operator=(Framebuffer&&) noexcept;

    [[nodiscard]] core::Result<void> create(const FramebufferDesc& desc);
    void                             destroy();
    void                             resize(i32 width, i32 height);

    void bind() const;
    void unbind() const;

    [[nodiscard]] u32             id()           const noexcept { return fbo_; }
    [[nodiscard]] i32             width()        const noexcept { return desc_.width;  }
    [[nodiscard]] i32             height()       const noexcept { return desc_.height; }
    [[nodiscard]] const Texture&  color(usize i) const          { return colors_.at(i); }
    [[nodiscard]] const Texture*  depthStencil() const noexcept { return has_ds_ ? &depth_ : nullptr; }

private:
    u32                  fbo_ = 0;
    FramebufferDesc      desc_{};
    std::vector<Texture> colors_;
    Texture              depth_;
    bool                 has_ds_ = false;
};

} // namespace soupmix::render
