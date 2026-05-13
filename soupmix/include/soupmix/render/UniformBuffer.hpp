#pragma once

#include "soupmix/core/Types.hpp"

namespace soupmix::render {

class UniformBuffer {
public:
    UniformBuffer() = default;
    ~UniformBuffer();

    UniformBuffer(const UniformBuffer&)            = delete;
    UniformBuffer& operator=(const UniformBuffer&) = delete;
    UniformBuffer(UniformBuffer&&) noexcept;
    UniformBuffer& operator=(UniformBuffer&&) noexcept;

    void create(usize size_bytes);
    void destroy();
    void update(const void* data, usize size_bytes, usize offset_bytes = 0);
    void bind(u32 binding_point) const;

    [[nodiscard]] u32   id()   const noexcept { return ubo_;  }
    [[nodiscard]] usize size() const noexcept { return size_; }

private:
    u32   ubo_  = 0;
    usize size_ = 0;
};

} // namespace soupmix::render
