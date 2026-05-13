#include "soupmix/project/ProjectSaver.hpp"

#include <nlohmann/json.hpp>

#include "soupmix/platform/FileSystem.hpp"
#include "soupmix/project/Project.hpp"

namespace soupmix::project {

core::Result<void> ProjectSaver::save(const Project& project, const std::filesystem::path& dir) {
    if (auto r = platform::ensureDirectory(dir); !r) return r.error();

    nlohmann::json j;
    j["soupmix_version"] = project.manifest().soupmix_version;
    j["project_version"] = project.manifest().project_version;
    j["uuid"]            = project.manifest().uuid.toString();
    j["name"]            = project.manifest().name;
    j["created"]         = project.manifest().created_iso8601;
    j["modified"]        = project.manifest().modified_iso8601;

    return platform::writeTextFile(dir / "project.json", j.dump(2));
}

} // namespace soupmix::project
