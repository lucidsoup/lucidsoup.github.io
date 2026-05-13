#include "soupmix/project/ProjectLoader.hpp"

#include <nlohmann/json.hpp>

#include "soupmix/graph/Graph.hpp"
#include "soupmix/graph/NodeRegistry.hpp"
#include "soupmix/platform/FileSystem.hpp"
#include "soupmix/project/Project.hpp"

namespace soupmix::project {

core::Result<std::unique_ptr<Project>> ProjectLoader::load(const std::filesystem::path& dir) {
    if (!platform::fileExists(dir / "project.json")) {
        return core::err(core::ErrorCode::NotFound, "project.json missing in " + dir.string());
    }

    auto manifest_text = platform::readTextFile(dir / "project.json");
    if (!manifest_text) return manifest_text.error();

    auto project = std::make_unique<Project>();
    project->setDirectory(dir);

    try {
        const auto j = nlohmann::json::parse(manifest_text.value());
        auto& m = project->manifest();
        m.soupmix_version = j.value("soupmix_version", "");
        m.project_version = j.value("project_version", 1);
        m.name            = j.value("name", "");
    } catch (const std::exception& e) {
        return core::err(core::ErrorCode::Parse, e.what());
    }

    // Real impl loads graph.json (recreating nodes via registry_),
    // scenes.json, mapping.json, midi.json.
    return std::move(project);
}

} // namespace soupmix::project
