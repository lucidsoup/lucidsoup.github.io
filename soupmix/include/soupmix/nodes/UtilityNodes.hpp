#pragma once

namespace soupmix::graph { class NodeRegistry; }

namespace soupmix::nodes {

// Registers lfo, envelope, math, select, time, beat_divide.
void registerUtilityNodes(graph::NodeRegistry& registry);

} // namespace soupmix::nodes
