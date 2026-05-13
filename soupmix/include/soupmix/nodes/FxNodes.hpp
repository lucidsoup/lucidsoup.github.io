#pragma once

namespace soupmix::graph { class NodeRegistry; }

namespace soupmix::nodes {

// Registers blur, feedback, kaleido, transform, levels, chroma, displace,
// mix, mask_apply.
void registerFxNodes(graph::NodeRegistry& registry);

} // namespace soupmix::nodes
