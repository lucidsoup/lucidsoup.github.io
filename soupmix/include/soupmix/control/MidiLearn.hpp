#pragma once

#include <optional>

#include "soupmix/control/MidiManager.hpp"
#include "soupmix/core/UUID.hpp"
#include "soupmix/graph/Parameter.hpp"

namespace soupmix::control {

// While "armed", the next incoming MIDI CC binds to the targeted parameter.
class MidiLearn {
public:
    void arm(core::UUID node, std::string parameter_name);
    void cancel();

    // Returns a binding to install if a MIDI event satisfies the armed target.
    [[nodiscard]] std::optional<graph::MidiBinding> tryConsume(const MidiEvent& ev);

    [[nodiscard]] bool armed() const noexcept { return armed_; }
    [[nodiscard]] const core::UUID& targetNode() const noexcept { return target_node_; }
    [[nodiscard]] const std::string& targetParameter() const noexcept { return target_param_; }

private:
    bool        armed_        = false;
    core::UUID  target_node_;
    std::string target_param_;
};

} // namespace soupmix::control
