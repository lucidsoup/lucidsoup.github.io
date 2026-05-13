#include "soupmix/project/Project.hpp"

#include "soupmix/graph/Graph.hpp"
#include "soupmix/project/AssetRegistry.hpp"

namespace soupmix::project {

Project::Project()
    : graph_(std::make_unique<graph::Graph>())
    , assets_(std::make_unique<AssetRegistry>()) {}

Project::~Project() = default;

graph::Graph&       Project::graph()       noexcept { return *graph_; }
const graph::Graph& Project::graph() const noexcept { return *graph_; }
AssetRegistry&      Project::assets()      noexcept { return *assets_; }

} // namespace soupmix::project
