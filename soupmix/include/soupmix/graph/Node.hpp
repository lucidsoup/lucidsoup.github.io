#pragma once

#include <string>
#include <vector>

#include <glm/vec2.hpp>

#include "soupmix/core/UUID.hpp"
#include "soupmix/graph/Parameter.hpp"
#include "soupmix/graph/Pin.hpp"

namespace soupmix::render { class Renderer; class Texture; }

namespace soupmix::graph {

class RenderRecorder;

struct GraphContext {
    render::Renderer* renderer = nullptr;
};

struct FrameContext {
    f64 time         = 0.0;
    f32 dt           = 0.0f;
    u64 frame_index  = 0;
    f32 beat_phase   = 0.0f;     // [0,1)
    u32 beat_counter = 0;
};

struct NodeCategory {
    enum : u8 { Source, Fx, Utility, Output, Mapping };
};

struct NodeMeta {
    std::string kind;             // stable id, e.g. "mandelbrot"
    std::string display_name;
    u8          category   = NodeCategory::Source;
    u16         version    = 1;
};

// Abstract base for every concrete node.
//
// Nodes do not call OpenGL directly. They append DrawPass records via
// the RenderRecorder passed to recordPasses().
class Node {
public:
    explicit Node(NodeMeta meta) : meta_(std::move(meta)) {}
    virtual ~Node() = default;

    Node(const Node&)            = delete;
    Node& operator=(const Node&) = delete;

    // Optional per-instance setup. Default does nothing.
    virtual void initialize(GraphContext&) {}
    virtual void shutdown  (GraphContext&) {}

    // Sample parameters, compute uniforms. Default does nothing.
    virtual void beforeFrame(const FrameContext&) {}
    virtual void afterFrame (const FrameContext&) {}

    // Append draw passes to produce this node's outputs. Pure virtual.
    virtual void recordPasses(RenderRecorder& recorder, const FrameContext& frame) = 0;

    [[nodiscard]] const core::UUID&   uuid()   const noexcept { return uuid_;  }
    [[nodiscard]] const NodeMeta&     meta()   const noexcept { return meta_;  }
    [[nodiscard]] const std::string&  label()  const noexcept { return label_; }
    [[nodiscard]] glm::vec2           position() const noexcept { return position_; }

    [[nodiscard]] const std::vector<Pin>&       inputs()    const noexcept { return inputs_;     }
    [[nodiscard]] const std::vector<Pin>&       outputs()   const noexcept { return outputs_;    }
    [[nodiscard]] const std::vector<Parameter>& parameters() const noexcept { return parameters_; }
    [[nodiscard]] std::vector<Parameter>&       parameters()       noexcept { return parameters_; }

    void setUuid(core::UUID id) noexcept { uuid_ = id; }
    void setLabel(std::string s) { label_ = std::move(s); }
    void setPosition(glm::vec2 p) noexcept { position_ = p; }

protected:
    // Helpers for derived nodes to declare their interface during ctor.
    void addInput (Pin p) { p.direction = PinDirection::Input;  inputs_.push_back(std::move(p));  }
    void addOutput(Pin p) { p.direction = PinDirection::Output; outputs_.push_back(std::move(p)); }
    void addParameter(Parameter p) { parameters_.push_back(std::move(p)); }

private:
    NodeMeta             meta_;
    core::UUID           uuid_;
    std::string          label_;
    glm::vec2            position_{0.0f, 0.0f};
    std::vector<Pin>     inputs_;
    std::vector<Pin>     outputs_;
    std::vector<Parameter> parameters_;
};

} // namespace soupmix::graph
