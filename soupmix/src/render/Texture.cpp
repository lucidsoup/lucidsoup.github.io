#include "soupmix/render/Texture.hpp"

#include <glad/gl.h>

#include <algorithm>
#include <cmath>

namespace soupmix::render {

namespace {

struct GLFormat { GLenum internal; GLenum format; GLenum type; };

GLFormat glFormat(TextureFormat f) {
    switch (f) {
        case TextureFormat::R8:      return {GL_R8,      GL_RED,  GL_UNSIGNED_BYTE};
        case TextureFormat::RG8:     return {GL_RG8,     GL_RG,   GL_UNSIGNED_BYTE};
        case TextureFormat::RGB8:    return {GL_RGB8,    GL_RGB,  GL_UNSIGNED_BYTE};
        case TextureFormat::RGBA8:   return {GL_RGBA8,   GL_RGBA, GL_UNSIGNED_BYTE};
        case TextureFormat::R16F:    return {GL_R16F,    GL_RED,  GL_HALF_FLOAT};
        case TextureFormat::RGBA16F: return {GL_RGBA16F, GL_RGBA, GL_HALF_FLOAT};
        case TextureFormat::R32F:    return {GL_R32F,    GL_RED,  GL_FLOAT};
        case TextureFormat::RGBA32F: return {GL_RGBA32F, GL_RGBA, GL_FLOAT};
        case TextureFormat::Depth24Stencil8:
            return {GL_DEPTH24_STENCIL8, GL_DEPTH_STENCIL, GL_UNSIGNED_INT_24_8};
    }
    return {GL_RGBA8, GL_RGBA, GL_UNSIGNED_BYTE};
}

GLint glFilter(FilterMode f) {
    switch (f) {
        case FilterMode::Nearest:      return GL_NEAREST;
        case FilterMode::Linear:       return GL_LINEAR;
        case FilterMode::LinearMipmap: return GL_LINEAR_MIPMAP_LINEAR;
    }
    return GL_LINEAR;
}

GLint glWrap(WrapMode w) {
    switch (w) {
        case WrapMode::Repeat:         return GL_REPEAT;
        case WrapMode::MirroredRepeat: return GL_MIRRORED_REPEAT;
        case WrapMode::ClampToEdge:    return GL_CLAMP_TO_EDGE;
        case WrapMode::ClampToBorder:  return GL_CLAMP_TO_BORDER;
    }
    return GL_CLAMP_TO_EDGE;
}

} // namespace

Texture::~Texture() { destroy(); }
Texture::Texture(Texture&& o) noexcept : id_(o.id_), desc_(o.desc_) { o.id_ = 0; }
Texture& Texture::operator=(Texture&& o) noexcept {
    if (this != &o) { destroy(); id_ = o.id_; desc_ = o.desc_; o.id_ = 0; }
    return *this;
}

core::Result<void> Texture::create(const TextureDesc& d) {
    destroy();
    desc_ = d;
    glCreateTextures(GL_TEXTURE_2D, 1, &id_);
    const auto fmt = glFormat(d.format);
    const i32 levels = d.generate_mipmaps ? 1 + static_cast<i32>(std::log2(std::max(d.width, d.height))) : 1;
    glTextureStorage2D(id_, levels, fmt.internal, d.width, d.height);
    glTextureParameteri(id_, GL_TEXTURE_MIN_FILTER, glFilter(d.min_filter));
    glTextureParameteri(id_, GL_TEXTURE_MAG_FILTER, glFilter(d.mag_filter));
    glTextureParameteri(id_, GL_TEXTURE_WRAP_S,     glWrap(d.wrap_s));
    glTextureParameteri(id_, GL_TEXTURE_WRAP_T,     glWrap(d.wrap_t));
    return {};
}

core::Result<void> Texture::upload(const void* pixels, usize /*byte_size*/) {
    if (!id_) return core::err(core::ErrorCode::InvalidState, "Texture::upload on unallocated texture");
    const auto fmt = glFormat(desc_.format);
    glTextureSubImage2D(id_, 0, 0, 0, desc_.width, desc_.height, fmt.format, fmt.type, pixels);
    if (desc_.generate_mipmaps) glGenerateTextureMipmap(id_);
    return {};
}

void Texture::destroy() {
    if (id_) { glDeleteTextures(1, &id_); id_ = 0; }
}

void Texture::resize(i32 w, i32 h) {
    if (w == desc_.width && h == desc_.height) return;
    TextureDesc d = desc_;
    d.width  = w;
    d.height = h;
    (void)create(d);
}

} // namespace soupmix::render
