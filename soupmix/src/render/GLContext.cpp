#include "soupmix/render/GLContext.hpp"

#include <glad/gl.h>
#include <GLFW/glfw3.h>

#include "soupmix/debug/Log.hpp"

namespace soupmix::render {

namespace {

void GLAPIENTRY debugCallback(GLenum /*source*/, GLenum type, GLuint /*id*/,
                              GLenum severity, GLsizei /*length*/,
                              const GLchar* message, const void* /*user*/) {
    if (severity == GL_DEBUG_SEVERITY_NOTIFICATION) return;
    const char* level = "info";
    if (type == GL_DEBUG_TYPE_ERROR) level = "error";
    else if (type == GL_DEBUG_TYPE_DEPRECATED_BEHAVIOR
          || type == GL_DEBUG_TYPE_UNDEFINED_BEHAVIOR) level = "warn";
    SOUPMIX_WARN("[GL {}] {}", level, message);
}

} // namespace

core::Result<void> initGL(bool enable_debug_callback) {
    if (!gladLoadGL(reinterpret_cast<GLADloadfunc>(glfwGetProcAddress))) {
        return core::err(core::ErrorCode::Unsupported, "gladLoadGL failed");
    }

    if (enable_debug_callback && GLAD_GL_KHR_debug) {
        glEnable(GL_DEBUG_OUTPUT);
        glEnable(GL_DEBUG_OUTPUT_SYNCHRONOUS);
        glDebugMessageCallback(debugCallback, nullptr);
    }

    SOUPMIX_INFO("OpenGL: {} | {} | GLSL {}",
                 reinterpret_cast<const char*>(glGetString(GL_VERSION)),
                 reinterpret_cast<const char*>(glGetString(GL_RENDERER)),
                 reinterpret_cast<const char*>(glGetString(GL_SHADING_LANGUAGE_VERSION)));
    return {};
}

} // namespace soupmix::render
