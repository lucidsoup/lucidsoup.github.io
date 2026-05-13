#include "soupmix/mapping/Calibration.hpp"

#include <glm/gtc/matrix_inverse.hpp>

namespace soupmix::mapping {

namespace {

// Compute the 3x3 matrix that maps the standard unit square to four
// arbitrary points `q`. The result is a homography (up to scale).
glm::mat3 squareToQuad(const std::array<glm::vec2, 4>& q) {
    const glm::vec2 d1 = q[1] - q[2];
    const glm::vec2 d2 = q[3] - q[2];
    const glm::vec2 s  = q[0] - q[1] + q[2] - q[3];

    const f32 denom = d1.x * d2.y - d1.y * d2.x;
    if (denom == 0.0f) return glm::mat3{1.0f};

    const f32 g = (s.x * d2.y - s.y * d2.x) / denom;
    const f32 h = (d1.x * s.y - d1.y * s.x) / denom;

    glm::mat3 m{1.0f};
    m[0][0] = q[1].x - q[0].x + g * q[1].x;
    m[0][1] = q[1].y - q[0].y + g * q[1].y;
    m[0][2] = g;
    m[1][0] = q[3].x - q[0].x + h * q[3].x;
    m[1][1] = q[3].y - q[0].y + h * q[3].y;
    m[1][2] = h;
    m[2][0] = q[0].x;
    m[2][1] = q[0].y;
    m[2][2] = 1.0f;
    return m;
}

} // namespace

glm::mat3 solveHomography(const std::array<glm::vec2, 4>& src,
                           const std::array<glm::vec2, 4>& dst) {
    const glm::mat3 a = squareToQuad(src);
    const glm::mat3 b = squareToQuad(dst);
    return b * glm::inverse(a);
}

} // namespace soupmix::mapping
