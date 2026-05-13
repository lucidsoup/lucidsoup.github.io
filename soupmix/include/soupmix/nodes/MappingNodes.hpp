#pragma once

namespace soupmix::graph { class NodeRegistry; }

namespace soupmix::nodes {

// Registers surface_quad, surface_grid, softedge, mask, projector.
void registerMappingNodes(graph::NodeRegistry& registry);

} // namespace soupmix::nodes
