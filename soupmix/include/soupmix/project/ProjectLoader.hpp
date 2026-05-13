#pragma once

#include <filesystem>
#include <memory>

#include "soupmix/core/Result.hpp"

namespace soupmix::graph { class NodeRegistry; }

namespace soupmix::project {

class Project;

class ProjectLoader {
public:
    explicit ProjectLoader(const graph::NodeRegistry& registry) : registry_(registry) {}

    [[nodiscard]] core::Result<std::unique_ptr<Project>> load(const std::filesystem::path& project_dir);

    inline static constexpr i32 kCurrentProjectVersion = 1;

private:
    const graph::NodeRegistry& registry_;
};

} // namespace soupmix::project
