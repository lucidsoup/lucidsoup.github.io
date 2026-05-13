#pragma once

#include <string>
#include <unordered_map>

#include <nlohmann/json.hpp>

#include "soupmix/core/UUID.hpp"
#include "soupmix/core/Types.hpp"

namespace soupmix::project {

class Scene {
public:
    [[nodiscard]] const core::UUID&  uuid()  const noexcept { return uuid_; }
    [[nodiscard]] const std::string& name()  const noexcept { return name_; }

    void setUuid(core::UUID id) noexcept { uuid_ = id; }
    void setName(std::string n) { name_ = std::move(n); }

    using Snapshot = std::unordered_map<core::UUID, nlohmann::json>;
    [[nodiscard]] Snapshot&       snapshot()       noexcept { return snapshot_; }
    [[nodiscard]] const Snapshot& snapshot() const noexcept { return snapshot_; }

private:
    core::UUID  uuid_;
    std::string name_;
    Snapshot    snapshot_;
};

enum class Easing : u8 { Linear, InOutCubic, InQuad, OutQuad, OutBounce };

struct Clip {
    core::UUID  uuid;
    std::string name;
    core::UUID  from;
    core::UUID  to;
    f32         duration_ms = 1000.0f;
    Easing      easing      = Easing::InOutCubic;
};

} // namespace soupmix::project
