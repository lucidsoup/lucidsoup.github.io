#include "soupmix/render/UniformBuffer.hpp"

#include <glad/gl.h>

namespace soupmix::render {

UniformBuffer::~UniformBuffer() { destroy(); }
UniformBuffer::UniformBuffer(UniformBuffer&& o) noexcept : ubo_(o.ubo_), size_(o.size_) { o.ubo_ = 0; o.size_ = 0; }
UniformBuffer& UniformBuffer::operator=(UniformBuffer&& o) noexcept {
    if (this != &o) { destroy(); ubo_ = o.ubo_; size_ = o.size_; o.ubo_ = 0; o.size_ = 0; }
    return *this;
}

void UniformBuffer::create(usize size_bytes) {
    destroy();
    size_ = size_bytes;
    glCreateBuffers(1, &ubo_);
    glNamedBufferStorage(ubo_, static_cast<GLsizeiptr>(size_), nullptr, GL_DYNAMIC_STORAGE_BIT);
}

void UniformBuffer::destroy() {
    if (ubo_) { glDeleteBuffers(1, &ubo_); ubo_ = 0; size_ = 0; }
}

void UniformBuffer::update(const void* data, usize size_bytes, usize offset_bytes) {
    if (!ubo_) return;
    glNamedBufferSubData(ubo_, static_cast<GLintptr>(offset_bytes),
                          static_cast<GLsizeiptr>(size_bytes), data);
}

void UniformBuffer::bind(u32 binding_point) const {
    if (ubo_) glBindBufferBase(GL_UNIFORM_BUFFER, binding_point, ubo_);
}

} // namespace soupmix::render
