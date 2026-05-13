#include "soupmix/mapping/GridSurface.hpp"

namespace soupmix::mapping {

GridSurface::GridSurface(i32 cols, i32 rows) : cols_(cols), rows_(rows) {
    vertices_.resize(static_cast<usize>(cols_ * rows_));
    handles_ .resize(static_cast<usize>(cols_ * rows_) * 4);
    for (i32 y = 0; y < rows_; ++y) {
        for (i32 x = 0; x < cols_; ++x) {
            const f32 u = static_cast<f32>(x) / static_cast<f32>(cols_ - 1);
            const f32 v = static_cast<f32>(y) / static_cast<f32>(rows_ - 1);
            vertices_[static_cast<usize>(y * cols_ + x)] = glm::vec2{u, v};
        }
    }
}

glm::vec2 GridSurface::vertex(i32 col, i32 row) const {
    return vertices_[static_cast<usize>(row * cols_ + col)];
}

void GridSurface::setVertex(i32 col, i32 row, glm::vec2 p) {
    vertices_[static_cast<usize>(row * cols_ + col)] = p;
}

} // namespace soupmix::mapping
