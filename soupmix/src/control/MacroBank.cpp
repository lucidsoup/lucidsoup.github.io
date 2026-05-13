#include "soupmix/control/MacroBank.hpp"

namespace soupmix::control {

Macro& MacroBank::add() {
    Macro m;
    m.uuid = core::UUID::generate();
    macros_.push_back(m);
    return macros_.back();
}

} // namespace soupmix::control
