#include "soupmix/control/MidiManager.hpp"

#include <RtMidi.h>

#include "soupmix/debug/Log.hpp"

namespace soupmix::control {

MidiManager::MidiManager()  = default;
MidiManager::~MidiManager() { shutdown(); }

core::Result<void> MidiManager::initialize() {
    try {
        in_  = std::make_unique<RtMidiIn>();
        out_ = std::make_unique<RtMidiOut>();
    } catch (const RtMidiError& e) {
        return core::err(core::ErrorCode::Io, e.what());
    }
    return {};
}

void MidiManager::shutdown() {
    if (in_  && in_->isPortOpen())  in_->closePort();
    if (out_ && out_->isPortOpen()) out_->closePort();
    in_.reset();
    out_.reset();
}

std::vector<std::string> MidiManager::listInputs() {
    std::vector<std::string> names;
    if (!in_) return names;
    const auto n = in_->getPortCount();
    for (unsigned i = 0; i < n; ++i) names.push_back(in_->getPortName(i));
    return names;
}

std::vector<std::string> MidiManager::listOutputs() {
    std::vector<std::string> names;
    if (!out_) return names;
    const auto n = out_->getPortCount();
    for (unsigned i = 0; i < n; ++i) names.push_back(out_->getPortName(i));
    return names;
}

core::Result<void> MidiManager::openInput(const std::string& name) {
    if (!in_) return core::err(core::ErrorCode::InvalidState, "MidiManager not initialized");
    const auto n = in_->getPortCount();
    for (unsigned i = 0; i < n; ++i) {
        if (in_->getPortName(i) == name) {
            try { in_->openPort(i); return {}; }
            catch (const RtMidiError& e) { return core::err(core::ErrorCode::Io, e.what()); }
        }
    }
    return core::err(core::ErrorCode::NotFound, "MIDI input not found: " + name);
}

core::Result<void> MidiManager::openOutput(const std::string& name) {
    if (!out_) return core::err(core::ErrorCode::InvalidState, "MidiManager not initialized");
    const auto n = out_->getPortCount();
    for (unsigned i = 0; i < n; ++i) {
        if (out_->getPortName(i) == name) {
            try { out_->openPort(i); return {}; }
            catch (const RtMidiError& e) { return core::err(core::ErrorCode::Io, e.what()); }
        }
    }
    return core::err(core::ErrorCode::NotFound, "MIDI output not found: " + name);
}

std::vector<MidiEvent> MidiManager::drain() {
    std::vector<MidiEvent> out;
    if (!in_ || !in_->isPortOpen()) return out;

    std::vector<unsigned char> bytes;
    for (;;) {
        const double ts = in_->getMessage(&bytes);
        if (bytes.empty()) break;
        MidiEvent ev;
        ev.timestamp = ts;
        if (bytes.size() >= 1) ev.status = bytes[0];
        if (bytes.size() >= 2) ev.data1  = bytes[1];
        if (bytes.size() >= 3) ev.data2  = bytes[2];
        out.push_back(ev);
    }
    return out;
}

void MidiManager::sendNoteOn(i32 ch, i32 note, i32 vel) {
    if (!out_ || !out_->isPortOpen()) return;
    std::vector<unsigned char> msg = {
        static_cast<unsigned char>(0x90 | (ch & 0x0F)),
        static_cast<unsigned char>(note & 0x7F),
        static_cast<unsigned char>(vel  & 0x7F),
    };
    try { out_->sendMessage(&msg); } catch (...) {}
}

void MidiManager::sendCc(i32 ch, i32 cc, i32 value) {
    if (!out_ || !out_->isPortOpen()) return;
    std::vector<unsigned char> msg = {
        static_cast<unsigned char>(0xB0 | (ch & 0x0F)),
        static_cast<unsigned char>(cc    & 0x7F),
        static_cast<unsigned char>(value & 0x7F),
    };
    try { out_->sendMessage(&msg); } catch (...) {}
}

} // namespace soupmix::control
