#pragma once

#include <string>
#include <unordered_map>

#include <nlohmann/json.hpp>

#include "soupmix/core/UUID.hpp"

namespace soupmix::project {

// Per-node parameter preset. Unlike Scene (which spans the whole graph),
// a Preset is scoped to a single node kind and is shared across projects.
class Preset {
public:
    [[nodiscard]] const core::UUID&  uuid()  const noexcept { return uuid_; }
    [[nodiscard]] const std::string& name()  const noexcept { return name_; }
    [[nodiscard]] const std::string& kind()  const noexcept { return kind_; }

    void setUuid(core::UUID id) noexcept { uuid_ = id; }
    void setName(std::string n) { name_ = std::move(n); }
    void setKind(std::string k) { kind_ = std::move(k); }

    [[nodiscard]] nlohmann::json&       parameters()       noexcept { return parameters_; }
    [[nodiscard]] const nlohmann::json& parameters() const noexcept { return parameters_; }

private:
    core::UUID     uuid_;
    std::string    name_;
    std::string    kind_;
    nlohmann::json parameters_;
};

} // namespace soupmix::project
