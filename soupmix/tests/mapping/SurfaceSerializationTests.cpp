#include <gtest/gtest.h>

#include "soupmix/mapping/Calibration.hpp"
#include "soupmix/mapping/QuadSurface.hpp"

using namespace soupmix;

TEST(QuadSurface, IdentityHomographyForUnitSquare) {
    mapping::QuadSurface q;
    q.setCorner(0, {0, 0});
    q.setCorner(1, {1, 0});
    q.setCorner(2, {1, 1});
    q.setCorner(3, {0, 1});
    const glm::mat3 h = q.homography();
    glm::vec3 v = h * glm::vec3{0.5f, 0.5f, 1.0f};
    EXPECT_NEAR(v.x / v.z, 0.5f, 1e-4f);
    EXPECT_NEAR(v.y / v.z, 0.5f, 1e-4f);
}
