#pragma once

#include <filesystem>
#include <memory>
#include <string>
#include <vector>

#include "soupmix/core/UUID.hpp"
#include "soupmix/mapping/BlendMask.hpp"
#include "soupmix/mapping/Projector.hpp"
#include "soupmix/mapping/Surface.hpp"

namespace soupmix::graph { class Graph; }

namespace soupmix::project {

class Scene;
class Preset;
class AssetRegistry;

struct ProjectManifest {
    std::string soupmix_version;
    i32         project_version = 1;
    core::UUID  uuid;
    std::string name;
    std::string created_iso8601;
    std::string modified_iso8601;
    core::UUID  default_scene;
    std::vector<core::UUID> projectors;
};

class Project {
public:
    Project();
    ~Project();

    Project(const Project&)            = delete;
    Project& operator=(const Project&) = delete;

    [[nodiscard]] const ProjectManifest& manifest() const noexcept { return manifest_; }
    [[nodiscard]] ProjectManifest&       manifest()       noexcept { return manifest_; }
    [[nodiscard]] graph::Graph&          graph()          noexcept;
    [[nodiscard]] const graph::Graph&    graph() const    noexcept;

    [[nodiscard]] std::vector<std::unique_ptr<mapping::Surface>>&   surfaces()    noexcept { return surfaces_; }
    [[nodiscard]] std::vector<mapping::BlendMask>&                  blendMasks()  noexcept { return blend_masks_; }
    [[nodiscard]] std::vector<std::unique_ptr<mapping::Projector>>& projectors()  noexcept { return projectors_; }

    [[nodiscard]] AssetRegistry&         assets()          noexcept;

    [[nodiscard]] const std::filesystem::path& directory() const noexcept { return directory_; }
    void                                       setDirectory(std::filesystem::path d) { directory_ = std::move(d); }

private:
    ProjectManifest                                       manifest_;
    std::unique_ptr<graph::Graph>                         graph_;
    std::vector<std::unique_ptr<mapping::Surface>>        surfaces_;
    std::vector<mapping::BlendMask>                       blend_masks_;
    std::vector<std::unique_ptr<mapping::Projector>>      projectors_;
    std::unique_ptr<AssetRegistry>                        assets_;
    std::filesystem::path                                 directory_;
};

} // namespace soupmix::project
