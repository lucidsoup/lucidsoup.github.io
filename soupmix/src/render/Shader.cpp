#include "soupmix/render/Shader.hpp"

#include <glad/gl.h>

#include <utility>
#include <vector>

#include "soupmix/debug/Log.hpp"
#include "soupmix/platform/FileSystem.hpp"

namespace soupmix::render {

namespace {

core::Result<u32> compileStage(GLenum stage, std::string_view src) {
    const u32 sh = glCreateShader(stage);
    const char* s = src.data();
    const auto  n = static_cast<GLint>(src.size());
    glShaderSource(sh, 1, &s, &n);
    glCompileShader(sh);

    GLint ok = GL_FALSE;
    glGetShaderiv(sh, GL_COMPILE_STATUS, &ok);
    if (!ok) {
        GLint len = 0;
        glGetShaderiv(sh, GL_INFO_LOG_LENGTH, &len);
        std::vector<char> log(static_cast<usize>(len));
        glGetShaderInfoLog(sh, len, nullptr, log.data());
        glDeleteShader(sh);
        return core::err(core::ErrorCode::Parse, std::string{log.data(), log.size()});
    }
    return sh;
}

} // namespace

Shader::~Shader() { destroy(); }
Shader::Shader(Shader&& o) noexcept : program_(o.program_), uniform_cache_(std::move(o.uniform_cache_)) { o.program_ = 0; }
Shader& Shader::operator=(Shader&& o) noexcept {
    if (this != &o) {
        destroy();
        program_       = o.program_;
        uniform_cache_ = std::move(o.uniform_cache_);
        o.program_     = 0;
    }
    return *this;
}

core::Result<void> Shader::compileFromSource(std::string_view vs, std::string_view fs) {
    destroy();
    auto v = compileStage(GL_VERTEX_SHADER,   vs);
    if (!v) return v.error();
    auto f = compileStage(GL_FRAGMENT_SHADER, fs);
    if (!f) { glDeleteShader(v.value()); return f.error(); }

    program_ = glCreateProgram();
    glAttachShader(program_, v.value());
    glAttachShader(program_, f.value());
    glLinkProgram(program_);
    glDeleteShader(v.value());
    glDeleteShader(f.value());

    GLint ok = GL_FALSE;
    glGetProgramiv(program_, GL_LINK_STATUS, &ok);
    if (!ok) {
        GLint len = 0;
        glGetProgramiv(program_, GL_INFO_LOG_LENGTH, &len);
        std::vector<char> log(static_cast<usize>(len));
        glGetProgramInfoLog(program_, len, nullptr, log.data());
        destroy();
        return core::err(core::ErrorCode::Parse, std::string{log.data(), log.size()});
    }
    return {};
}

core::Result<void> Shader::compileFromFiles(const std::string& vp, const std::string& fp) {
    auto vs = platform::readTextFile(vp);
    if (!vs) return vs.error();
    auto fs = platform::readTextFile(fp);
    if (!fs) return fs.error();
    return compileFromSource(vs.value(), fs.value());
}

void Shader::destroy() {
    if (program_) { glDeleteProgram(program_); program_ = 0; }
    uniform_cache_.clear();
}

void Shader::bind()   const { if (program_) glUseProgram(program_); }
void Shader::unbind() const { glUseProgram(0); }

i32 Shader::location(std::string_view name) {
    std::string key(name);
    auto it = uniform_cache_.find(key);
    if (it != uniform_cache_.end()) return it->second;
    const i32 loc = glGetUniformLocation(program_, key.c_str());
    uniform_cache_[std::move(key)] = loc;
    return loc;
}

void Shader::setUniform(std::string_view n, i32 v)              { glUniform1i (location(n), v); }
void Shader::setUniform(std::string_view n, f32 v)              { glUniform1f (location(n), v); }
void Shader::setUniform(std::string_view n, glm::vec2 v)        { glUniform2f (location(n), v.x, v.y); }
void Shader::setUniform(std::string_view n, glm::vec3 v)        { glUniform3f (location(n), v.x, v.y, v.z); }
void Shader::setUniform(std::string_view n, glm::vec4 v)        { glUniform4f (location(n), v.x, v.y, v.z, v.w); }
void Shader::setUniform(std::string_view n, const glm::mat4& m) { glUniformMatrix4fv(location(n), 1, GL_FALSE, &m[0][0]); }

} // namespace soupmix::render
