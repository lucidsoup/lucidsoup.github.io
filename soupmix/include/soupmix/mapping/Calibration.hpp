#pragma once

#include <array>

#include <glm/mat3x3.hpp>
#include <glm/vec2.hpp>

namespace soupmix::mapping {

// Solve a 3x3 homography mapping the 4 points `src` to the 4 points `dst`.
// Used by QuadSurface and grid bezier patches. Returns identity if the
// solve degenerates (e.g. three collinear points).
[[nodiscard]] glm::mat3 solveHomography(const std::array<glm::vec2, 4>& src,
                                         const std::array<glm::vec2, 4>& dst);

} // namespace soupmix::mapping
