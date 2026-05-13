#pragma once

namespace soupmix::graph { class NodeRegistry; }

namespace soupmix::nodes {

// Registers to_layer, to_window, to_surface.
void registerOutputNodes(graph::NodeRegistry& registry);

} // namespace soupmix::nodes
