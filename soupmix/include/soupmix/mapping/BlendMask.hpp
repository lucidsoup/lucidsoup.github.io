#pragma once

#include <vector>

#include <glm/vec2.hpp>

#include "soupmix/core/UUID.hpp"
#include "soupmix/core/Types.hpp"

namespace soupmix::mapping {

class BlendMask {
public:
    [[nodiscard]] const core::UUID&             uuid()       const noexcept { return uuid_; }
    [[nodiscard]] const std::vector<glm::vec2>& polygon()    const noexcept { return polygon_; }
    [[nodiscard]] f32                           featherPx()  const noexcept { return feather_px_; }
    [[nodiscard]] f32                           gamma()      const noexcept { return gamma_; }
    [[nodiscard]] f32                           blackLevel() const noexcept { return black_level_; }

    void setUuid(core::UUID id) noexcept { uuid_ = id; }
    void setPolygon(std::vector<glm::vec2> poly) { polygon_ = std::move(poly); }
    void setFeatherPx(f32 v) noexcept { feather_px_ = v; }
    void setGamma(f32 v) noexcept     { gamma_ = v; }
    void setBlackLevel(f32 v) noexcept { black_level_ = v; }

private:
    core::UUID             uuid_;
    std::vector<glm::vec2> polygon_;
    f32                    feather_px_  = 30.0f;
    f32                    gamma_       = 2.2f;
    f32                    black_level_ = 0.0f;
};

} // namespace soupmix::mapping
