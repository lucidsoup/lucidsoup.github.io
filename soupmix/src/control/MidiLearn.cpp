#include "soupmix/control/MidiLearn.hpp"

namespace soupmix::control {

void MidiLearn::arm(core::UUID node, std::string parameter_name) {
    armed_        = true;
    target_node_  = node;
    target_param_ = std::move(parameter_name);
}

void MidiLearn::cancel() {
    armed_ = false;
    target_node_  = core::UUID{};
    target_param_.clear();
}

std::optional<graph::MidiBinding> MidiLearn::tryConsume(const MidiEvent& ev) {
    if (!armed_) return std::nullopt;
    // CC messages start with status 0xB0..0xBF (channel in low nibble).
    if ((ev.status & 0xF0) != 0xB0) return std::nullopt;
    graph::MidiBinding b;
    b.channel = ev.status & 0x0F;
    b.cc      = ev.data1;
    armed_ = false;
    return b;
}

} // namespace soupmix::control
