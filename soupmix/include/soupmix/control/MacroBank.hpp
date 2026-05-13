#pragma once

#include <string>
#include <vector>

#include "soupmix/core/UUID.hpp"
#include "soupmix/core/Types.hpp"

namespace soupmix::control {

// A macro maps one controller value to multiple parameter targets with
// per-target scaling. Lets a single knob drive many things.
struct MacroTarget {
    core::UUID  node;
    std::string parameter;
    f32         min  = 0.0f;
    f32         max  = 1.0f;
};

struct Macro {
    core::UUID                uuid;
    std::string               name;
    f32                       value = 0.0f;          // [0,1]
    std::vector<MacroTarget>  targets;
};

class MacroBank {
public:
    Macro&                          add();
    [[nodiscard]] const std::vector<Macro>& macros() const noexcept { return macros_; }
    [[nodiscard]] std::vector<Macro>&       macros()       noexcept { return macros_; }

private:
    std::vector<Macro> macros_;
};

} // namespace soupmix::control
