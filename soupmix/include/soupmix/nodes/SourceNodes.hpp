#pragma once

namespace soupmix::graph { class NodeRegistry; }

namespace soupmix::nodes {

// Registers solid_color, checker, gradient, noise, mandelbrot, julia,
// sacred_geometry, image, video.
void registerSourceNodes(graph::NodeRegistry& registry);

} // namespace soupmix::nodes
