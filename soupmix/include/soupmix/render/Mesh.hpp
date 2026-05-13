#pragma once

#include <span>

#include "soupmix/core/Types.hpp"

namespace soupmix::render {

enum class IndexType : u8 { U16, U32 };
enum class Primitive : u8 { Triangles, TriangleStrip, Lines, LineStrip, Points };

struct VertexAttribute {
    u32 location  = 0;
    u32 size      = 0;     // 1..4 floats
    u32 offset    = 0;     // bytes within the vertex
};

class Mesh {
public:
    Mesh() = default;
    ~Mesh();

    Mesh(const Mesh&)            = delete;
    Mesh& operator=(const Mesh&) = delete;
    Mesh(Mesh&&) noexcept;
    Mesh& operator=(Mesh&&) noexcept;

    void create(std::span<const f32>             vertices,
                u32                              vertex_stride_bytes,
                std::span<const VertexAttribute> attributes,
                std::span<const u32>             indices    = {},
                IndexType                        index_type = IndexType::U32);

    void destroy();

    void draw(Primitive prim = Primitive::Triangles) const;

    [[nodiscard]] u32 vao() const noexcept { return vao_; }

private:
    u32       vao_     = 0;
    u32       vbo_     = 0;
    u32       ibo_     = 0;
    u32       count_   = 0;     // vertex count if no IBO, else index count
    IndexType itype_   = IndexType::U32;
    bool      indexed_ = false;
};

// Cached unit-fullscreen triangle covering [-1,1]^2 in clip space.
[[nodiscard]] const Mesh& fullscreenTriangle();

} // namespace soupmix::render
