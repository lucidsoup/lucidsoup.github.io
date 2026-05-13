#pragma once

#include <string>
#include <variant>

#include <glm/vec2.hpp>
#include <glm/vec3.hpp>
#include <glm/vec4.hpp>

#include "soupmix/core/Types.hpp"

namespace soupmix::render { class Texture; }
namespace soupmix::mapping { class Surface; }

namespace soupmix::graph {

enum class PinType : u8 {
    Texture,
    Float,
    Vec2,
    Vec3,
    Vec4,
    Color,
    Surface,
    Trigger,
    Beat,
};

struct BeatValue {
    f32 phase   = 0.0f;   // [0,1)
    u32 counter = 0;
};

// Value carried on a pin during a frame. For Texture and Surface the
// engine stores a non-owning pointer; the resource is owned elsewhere
// (Renderer pool, Project asset registry).
using Value = std::variant<
    std::monostate,            // none / disconnected
    const render::Texture*,
    f32,
    glm::vec2,
    glm::vec3,
    glm::vec4,
    const mapping::Surface*,
    bool,                      // Trigger
    BeatValue
>;

[[nodiscard]] PinType  pinTypeOf(const Value& v) noexcept;
[[nodiscard]] const char* pinTypeName(PinType t) noexcept;

} // namespace soupmix::graph
