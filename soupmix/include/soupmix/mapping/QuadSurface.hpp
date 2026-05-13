#pragma once

#include <array>

#include <glm/mat3x3.hpp>
#include <glm/vec2.hpp>

#include "soupmix/mapping/Surface.hpp"

namespace soupmix::mapping {

class QuadSurface final : public Surface {
public:
    QuadSurface();

    [[nodiscard]] SurfaceKind kind() const noexcept override { return SurfaceKind::Quad; }

    // Four output corners (pixel coords on the projector canvas), TL, TR, BR, BL.
    [[nodiscard]] const std::array<glm::vec2, 4>& corners() const noexcept { return corners_; }
    void setCorner(usize i, glm::vec2 p);

    // Four content-UV corners (the rectangle of the input texture this
    // surface samples from), defaulting to the full [0,1] rectangle.
    [[nodiscard]] const std::array<glm::vec2, 4>& contentUv() const noexcept { return content_uv_; }
    void setContentUv(usize i, glm::vec2 uv);

    // 3x3 homography mapping content-UV to output-pixel space. Recomputed
    // lazily when corners change.
    [[nodiscard]] glm::mat3 homography() const;

private:
    std::array<glm::vec2, 4> corners_{};
    std::array<glm::vec2, 4> content_uv_{};
    mutable glm::mat3        cached_h_{1.0f};
    mutable bool             dirty_ = true;
};

} // namespace soupmix::mapping
