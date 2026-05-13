#pragma once

#include <vector>

#include <glm/vec2.hpp>

#include "soupmix/mapping/Surface.hpp"

namespace soupmix::mapping {

class GridSurface final : public Surface {
public:
    GridSurface(i32 cols = 8, i32 rows = 8);

    [[nodiscard]] SurfaceKind kind() const noexcept override { return SurfaceKind::Grid; }

    [[nodiscard]] i32 cols() const noexcept { return cols_; }
    [[nodiscard]] i32 rows() const noexcept { return rows_; }

    // Output-space position of grid vertex (col, row). Bilinear initially;
    // bezier subdivision happens in shaders/mapping/output_quad.vert.
    [[nodiscard]] glm::vec2 vertex(i32 col, i32 row) const;
    void                    setVertex(i32 col, i32 row, glm::vec2 p);

    // Bezier handles per vertex (4 handles: in_x, in_y, out_x, out_y).
    [[nodiscard]] const std::vector<glm::vec2>& handles() const noexcept { return handles_; }

private:
    i32                    cols_ = 0;
    i32                    rows_ = 0;
    std::vector<glm::vec2> vertices_;
    std::vector<glm::vec2> handles_;
};

} // namespace soupmix::mapping
