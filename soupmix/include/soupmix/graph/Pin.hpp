#pragma once

#include <string>

#include "soupmix/core/UUID.hpp"
#include "soupmix/graph/Value.hpp"

namespace soupmix::graph {

enum class PinDirection : u8 { Input, Output };

struct Pin {
    core::UUID   uuid;
    std::string  name;          // machine-friendly, stable across versions
    std::string  display_name;
    PinType      type      = PinType::Float;
    PinDirection direction = PinDirection::Input;
};

} // namespace soupmix::graph
