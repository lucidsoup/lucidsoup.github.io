#pragma once

#include <cstdint>

#include "soupmix/core/Result.hpp"
#include "soupmix/core/Types.hpp"

namespace soupmix::render {

enum class TextureFormat : u8 {
    R8,
    RG8,
    RGB8,
    RGBA8,
    R16F,
    RGBA16F,
    R32F,
    RGBA32F,
    Depth24Stencil8,
};

enum class FilterMode : u8 { Nearest, Linear, LinearMipmap };
enum class WrapMode   : u8 { Repeat, MirroredRepeat, ClampToEdge, ClampToBorder };

struct TextureDesc {
    i32           width  = 0;
    i32           height = 0;
    TextureFormat format = TextureFormat::RGBA8;
    FilterMode    min_filter = FilterMode::Linear;
    FilterMode    mag_filter = FilterMode::Linear;
    WrapMode      wrap_s     = WrapMode::ClampToEdge;
    WrapMode      wrap_t     = WrapMode::ClampToEdge;
    bool          generate_mipmaps = false;
};

class Texture {
public:
    Texture() = default;
    ~Texture();

    Texture(const Texture&)            = delete;
    Texture& operator=(const Texture&) = delete;
    Texture(Texture&&) noexcept;
    Texture& operator=(Texture&&) noexcept;

    [[nodiscard]] core::Result<void> create(const TextureDesc& desc);
    [[nodiscard]] core::Result<void> upload(const void* pixels, usize byte_size);
    void                             destroy();

    void resize(i32 width, i32 height);

    [[nodiscard]] u32           id()    const noexcept { return id_; }
    [[nodiscard]] const TextureDesc& desc() const noexcept { return desc_; }

private:
    u32         id_ = 0;
    TextureDesc desc_{};
};

} // namespace soupmix::render
