#pragma once

#include <array>
#include <string>
#include <unordered_map>
#include <variant>
#include <vector>

#include <glm/mat4x4.hpp>
#include <glm/vec2.hpp>
#include <glm/vec3.hpp>
#include <glm/vec4.hpp>

#include "soupmix/core/Types.hpp"

namespace soupmix::render {

class Shader;
class Texture;
class Framebuffer;
class Mesh;

using UniformValue = std::variant<i32, f32, glm::vec2, glm::vec3, glm::vec4, glm::mat4>;

enum class BlendMode : u8 { Off, Alpha, Additive, Multiply, Screen };

// A single GPU draw call. Held as plain data so passes can be recorded
// off the render thread and replayed in order during execution.
struct DrawPass {
    std::string                                    name;
    const Shader*                                  shader = nullptr;
    const Framebuffer*                             target = nullptr;   // null = default framebuffer
    const Mesh*                                    mesh   = nullptr;   // null = fullscreenTriangle()
    std::array<const Texture*, 8>                  inputs{};            // sampler units 0..7
    std::unordered_map<std::string, UniformValue>  uniforms;
    glm::vec4                                      clear_color    {0,0,0,0};
    bool                                           clear          = false;
    BlendMode                                      blend          = BlendMode::Off;
    bool                                           depth_test     = false;
    bool                                           depth_write    = false;
    bool                                           viewport_set   = false;
    std::array<i32, 4>                             viewport_xywh  {0,0,0,0};
};

using DrawList = std::vector<DrawPass>;

} // namespace soupmix::render
