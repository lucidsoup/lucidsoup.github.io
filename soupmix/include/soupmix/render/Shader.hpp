#pragma once

#include <string>
#include <string_view>
#include <unordered_map>

#include <glm/mat4x4.hpp>
#include <glm/vec2.hpp>
#include <glm/vec3.hpp>
#include <glm/vec4.hpp>

#include "soupmix/core/Result.hpp"
#include "soupmix/core/Types.hpp"

namespace soupmix::render {

class Shader {
public:
    Shader() = default;
    ~Shader();

    Shader(const Shader&)            = delete;
    Shader& operator=(const Shader&) = delete;
    Shader(Shader&&) noexcept;
    Shader& operator=(Shader&&) noexcept;

    [[nodiscard]] core::Result<void> compileFromSource(std::string_view vertex_glsl,
                                                       std::string_view fragment_glsl);
    [[nodiscard]] core::Result<void> compileFromFiles(const std::string& vertex_path,
                                                      const std::string& fragment_path);

    void destroy();

    void bind() const;
    void unbind() const;

    void setUniform(std::string_view name, i32 value);
    void setUniform(std::string_view name, f32 value);
    void setUniform(std::string_view name, glm::vec2 value);
    void setUniform(std::string_view name, glm::vec3 value);
    void setUniform(std::string_view name, glm::vec4 value);
    void setUniform(std::string_view name, const glm::mat4& value);

    [[nodiscard]] u32  id()    const noexcept { return program_; }
    [[nodiscard]] bool valid() const noexcept { return program_ != 0; }

private:
    [[nodiscard]] i32 location(std::string_view name);

    u32                                        program_ = 0;
    std::unordered_map<std::string, i32>       uniform_cache_;
};

} // namespace soupmix::render
