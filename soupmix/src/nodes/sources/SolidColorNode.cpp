#include "soupmix/graph/Node.hpp"
#include "soupmix/graph/RenderRecorder.hpp"

namespace soupmix::nodes::sources {

class SolidColorNode final : public graph::Node {
public:
    SolidColorNode()
        : graph::Node(graph::NodeMeta{
              .kind         = "solid_color",
              .display_name = "Solid Color",
              .category     = graph::NodeCategory::Source,
              .version      = 1,
          })
    {
        graph::Pin out;
        out.name         = "out";
        out.display_name = "Out";
        out.type         = graph::PinType::Texture;
        addOutput(out);

        graph::Parameter color;
        color.name         = "color";
        color.display_name = "Color";
        color.type         = graph::ParamType::Color;
        color.v_vec4       = {1.0f, 0.5f, 0.2f, 1.0f};
        addParameter(color);
    }

    void recordPasses(graph::RenderRecorder& /*recorder*/, const graph::FrameContext& /*frame*/) override {
        // Real impl emits a fullscreen-triangle pass that clears the
        // output framebuffer to `color`. Stub: nothing yet.
    }
};

std::unique_ptr<graph::Node> makeSolidColorNode() {
    return std::make_unique<SolidColorNode>();
}

} // namespace soupmix::nodes::sources
