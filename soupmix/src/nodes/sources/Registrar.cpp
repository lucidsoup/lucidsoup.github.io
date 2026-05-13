#include "soupmix/graph/NodeRegistry.hpp"
#include "soupmix/nodes/SourceNodes.hpp"

namespace soupmix::nodes::sources {
std::unique_ptr<graph::Node> makeSolidColorNode();
} // namespace soupmix::nodes::sources

namespace soupmix::nodes {

void registerSourceNodes(graph::NodeRegistry& registry) {
    registry.registerKind(
        graph::NodeMeta{
            .kind         = "solid_color",
            .display_name = "Solid Color",
            .category     = graph::NodeCategory::Source,
            .version      = 1,
        },
        sources::makeSolidColorNode);

    // Additional source kinds (checker, mandelbrot, julia, ...) get
    // registered here as their .cpp files are added.
}

} // namespace soupmix::nodes
