#include "soupmix/mapping/QuadSurface.hpp"

#include "soupmix/mapping/Calibration.hpp"

namespace soupmix::mapping {

QuadSurface::QuadSurface() {
    corners_     = {glm::vec2{0,0}, glm::vec2{1,0}, glm::vec2{1,1}, glm::vec2{0,1}};
    content_uv_  = {glm::vec2{0,0}, glm::vec2{1,0}, glm::vec2{1,1}, glm::vec2{0,1}};
}

void QuadSurface::setCorner(usize i, glm::vec2 p) {
    if (i < corners_.size()) { corners_[i] = p; dirty_ = true; }
}

void QuadSurface::setContentUv(usize i, glm::vec2 uv) {
    if (i < content_uv_.size()) { content_uv_[i] = uv; dirty_ = true; }
}

glm::mat3 QuadSurface::homography() const {
    if (dirty_) {
        cached_h_ = solveHomography(content_uv_, corners_);
        dirty_    = false;
    }
    return cached_h_;
}

} // namespace soupmix::mapping
