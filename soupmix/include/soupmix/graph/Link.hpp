#pragma once

#include "soupmix/core/UUID.hpp"

namespace soupmix::graph {

struct PinRef {
    core::UUID node;
    core::UUID pin;

    auto operator<=>(const PinRef&) const = default;
};

struct Link {
    core::UUID uuid;
    PinRef     from;     // output pin
    PinRef     to;       // input pin
};

} // namespace soupmix::graph
