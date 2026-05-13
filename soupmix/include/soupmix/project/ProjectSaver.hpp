#pragma once

#include <filesystem>

#include "soupmix/core/Result.hpp"

namespace soupmix::project {

class Project;

class ProjectSaver {
public:
    [[nodiscard]] core::Result<void> save(const Project& project,
                                           const std::filesystem::path& project_dir);
};

} // namespace soupmix::project
