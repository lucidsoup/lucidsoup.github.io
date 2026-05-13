#pragma once

#include <memory>
#include <string>
#include <vector>

#include "soupmix/core/Result.hpp"
#include "soupmix/core/Types.hpp"

class RtMidiIn;
class RtMidiOut;

namespace soupmix::control {

struct MidiEvent {
    f64 timestamp = 0.0;
    i32 status    = 0;
    i32 data1     = 0;
    i32 data2     = 0;
};

class MidiManager {
public:
    MidiManager();
    ~MidiManager();

    MidiManager(const MidiManager&)            = delete;
    MidiManager& operator=(const MidiManager&) = delete;

    [[nodiscard]] core::Result<void>             initialize();
    void                                          shutdown();

    [[nodiscard]] std::vector<std::string>       listInputs();
    [[nodiscard]] std::vector<std::string>       listOutputs();
    [[nodiscard]] core::Result<void>             openInput(const std::string& name);
    [[nodiscard]] core::Result<void>             openOutput(const std::string& name);

    // Drain queued input events. Called once per frame from the render thread.
    [[nodiscard]] std::vector<MidiEvent>         drain();

    void sendNoteOn(i32 channel, i32 note, i32 velocity);
    void sendCc(i32 channel, i32 cc, i32 value);

private:
    std::unique_ptr<RtMidiIn>  in_;
    std::unique_ptr<RtMidiOut> out_;
};

} // namespace soupmix::control
