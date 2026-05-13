#include "soupmix/render/Mesh.hpp"

#include <glad/gl.h>

#include <array>

namespace soupmix::render {

Mesh::~Mesh() { destroy(); }
Mesh::Mesh(Mesh&& o) noexcept
    : vao_(o.vao_), vbo_(o.vbo_), ibo_(o.ibo_), count_(o.count_), itype_(o.itype_), indexed_(o.indexed_) {
    o.vao_ = o.vbo_ = o.ibo_ = 0; o.indexed_ = false;
}
Mesh& Mesh::operator=(Mesh&& o) noexcept {
    if (this != &o) {
        destroy();
        vao_ = o.vao_; vbo_ = o.vbo_; ibo_ = o.ibo_;
        count_ = o.count_; itype_ = o.itype_; indexed_ = o.indexed_;
        o.vao_ = o.vbo_ = o.ibo_ = 0; o.indexed_ = false;
    }
    return *this;
}

void Mesh::create(std::span<const f32>             vertices,
                  u32                              stride_bytes,
                  std::span<const VertexAttribute> attributes,
                  std::span<const u32>             indices,
                  IndexType                        index_type) {
    destroy();
    glCreateBuffers(1, &vbo_);
    glNamedBufferStorage(vbo_,
        static_cast<GLsizeiptr>(vertices.size() * sizeof(f32)),
        vertices.data(),
        0);

    glCreateVertexArrays(1, &vao_);
    glVertexArrayVertexBuffer(vao_, 0, vbo_, 0, static_cast<GLsizei>(stride_bytes));

    for (const auto& a : attributes) {
        glEnableVertexArrayAttrib(vao_, a.location);
        glVertexArrayAttribFormat(vao_, a.location, static_cast<GLint>(a.size), GL_FLOAT, GL_FALSE, a.offset);
        glVertexArrayAttribBinding(vao_, a.location, 0);
    }

    if (!indices.empty()) {
        glCreateBuffers(1, &ibo_);
        glNamedBufferStorage(ibo_,
            static_cast<GLsizeiptr>(indices.size() * sizeof(u32)),
            indices.data(),
            0);
        glVertexArrayElementBuffer(vao_, ibo_);
        count_   = static_cast<u32>(indices.size());
        indexed_ = true;
        itype_   = index_type;
    } else {
        count_   = static_cast<u32>(vertices.size() * sizeof(f32) / stride_bytes);
        indexed_ = false;
    }
}

void Mesh::destroy() {
    if (ibo_) { glDeleteBuffers(1, &ibo_); ibo_ = 0; }
    if (vbo_) { glDeleteBuffers(1, &vbo_); vbo_ = 0; }
    if (vao_) { glDeleteVertexArrays(1, &vao_); vao_ = 0; }
    count_ = 0; indexed_ = false;
}

void Mesh::draw(Primitive prim) const {
    if (!vao_) return;
    GLenum p = GL_TRIANGLES;
    switch (prim) {
        case Primitive::Triangles:     p = GL_TRIANGLES;      break;
        case Primitive::TriangleStrip: p = GL_TRIANGLE_STRIP; break;
        case Primitive::Lines:         p = GL_LINES;          break;
        case Primitive::LineStrip:     p = GL_LINE_STRIP;     break;
        case Primitive::Points:        p = GL_POINTS;         break;
    }
    glBindVertexArray(vao_);
    if (indexed_) {
        const GLenum t = (itype_ == IndexType::U16) ? GL_UNSIGNED_SHORT : GL_UNSIGNED_INT;
        glDrawElements(p, static_cast<GLsizei>(count_), t, nullptr);
    } else {
        glDrawArrays(p, 0, static_cast<GLsizei>(count_));
    }
    glBindVertexArray(0);
}

const Mesh& fullscreenTriangle() {
    static Mesh mesh;
    static bool inited = false;
    if (!inited) {
        // Single triangle covering [-1,1]^2 (with UVs in [0,2]).
        const std::array<f32, 12> verts = {
            // pos.xy        uv
            -1.0f, -1.0f,    0.0f, 0.0f,
             3.0f, -1.0f,    2.0f, 0.0f,
            -1.0f,  3.0f,    0.0f, 2.0f,
        };
        const std::array<VertexAttribute, 2> attrs = {
            VertexAttribute{0, 2, 0},
            VertexAttribute{1, 2, 8},
        };
        mesh.create(std::span<const f32>(verts), 16, std::span<const VertexAttribute>(attrs));
        inited = true;
    }
    return mesh;
}

} // namespace soupmix::render
