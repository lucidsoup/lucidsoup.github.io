#pragma once

#include <vector>

#include "soupmix/core/UUID.hpp"

namespace soupmix::mapping {

// A layered arrangement of surfaces + blend masks rendered onto one
// projector canvas. Owned by Projector.
struct OutputLayout {
    std::vector<core::UUID> surfaces;       // back-to-front order
    std::vector<core::UUID> blend_masks;
};

} // namespace soupmix::mapping
