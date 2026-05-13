#pragma once

#include <optional>
#include <string>
#include <vector>

#include <glm/vec2.hpp>
#include <glm/vec3.hpp>
#include <glm/vec4.hpp>

#include "soupmix/core/Types.hpp"

namespace soupmix::graph {

enum class ParamType : u8 {
    Bool, Int, Float, Vec2, Vec3, Vec4, Color, String, Enum, Path,
};

struct FloatRange {
    f32 min       = 0.0f;
    f32 max       = 1.0f;
    f32 step      = 0.01f;
    f32 default_v = 0.0f;
};

struct MidiBinding {
    i32 channel = 0;
    i32 cc      = 0;
};
struct OscBinding {
    std::string address;
};

struct Binding {
    std::optional<MidiBinding> midi;
    std::optional<OscBinding>  osc;
};

struct Parameter {
    std::string  name;
    std::string  display_name;
    ParamType    type  = ParamType::Float;
    FloatRange   range{};
    std::vector<std::string> enum_values;        // when type == Enum

    // Current value, stored using the appropriate alternative for `type`.
    bool       v_bool   = false;
    i32        v_int    = 0;
    f32        v_float  = 0.0f;
    glm::vec2  v_vec2   {0.0f};
    glm::vec3  v_vec3   {0.0f};
    glm::vec4  v_vec4   {0.0f};
    std::string v_string;
    Binding     binding;
};

} // namespace soupmix::graph
