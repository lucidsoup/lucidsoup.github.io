#include "soupmix/graph/NodeRegistry.hpp"
#include "soupmix/nodes/FxNodes.hpp"

namespace soupmix::nodes {

void registerFxNodes(graph::NodeRegistry& /*registry*/) {
    // blur, feedback, kaleido, transform, levels, chroma, displace,
    // mix, mask_apply get registered here as their files are added.
}

} // namespace soupmix::nodes
