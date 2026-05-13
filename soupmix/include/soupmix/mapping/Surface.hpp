#pragma once

#include <array>
#include <string>

#include <glm/vec2.hpp>

#include "soupmix/core/UUID.hpp"
#include "soupmix/core/Types.hpp"

namespace soupmix::mapping {

enum class SurfaceKind : u8 { Quad, Grid, Mask };

class Surface {
public:
    virtual ~Surface() = default;

    [[nodiscard]] const core::UUID& uuid() const noexcept { return uuid_; }
    [[nodiscard]] const std::string& name() const noexcept { return name_; }
    [[nodiscard]] virtual SurfaceKind kind() const noexcept = 0;

    void setUuid(core::UUID id) noexcept { uuid_ = id; }
    void setName(std::string n) { name_ = std::move(n); }

protected:
    core::UUID  uuid_;
    std::string name_;
};

} // namespace soupmix::mapping
