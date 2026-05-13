#include "soupmix/platform/Window.hpp"

#include <GLFW/glfw3.h>

#include "soupmix/debug/Log.hpp"

namespace soupmix::platform {

namespace {

bool g_glfw_inited = false;

void glfwErrorCallback(int code, const char* description) {
    SOUPMIX_ERROR("GLFW error {}: {}", code, description);
}

} // namespace

Window::Window() = default;
Window::~Window() { destroy(); }

core::Result<void> Window::create(const WindowConfig& cfg) {
    if (!g_glfw_inited) {
        glfwSetErrorCallback(glfwErrorCallback);
        if (!glfwInit()) {
            return core::err(core::ErrorCode::Io, "glfwInit failed");
        }
        g_glfw_inited = true;
    }

    glfwWindowHint(GLFW_CONTEXT_VERSION_MAJOR, 4);
    glfwWindowHint(GLFW_CONTEXT_VERSION_MINOR, 5);
    glfwWindowHint(GLFW_OPENGL_PROFILE, GLFW_OPENGL_CORE_PROFILE);
    glfwWindowHint(GLFW_OPENGL_FORWARD_COMPAT, GLFW_TRUE);
    glfwWindowHint(GLFW_DECORATED, cfg.decorated ? GLFW_TRUE : GLFW_FALSE);
    glfwWindowHint(GLFW_VISIBLE,   cfg.visible   ? GLFW_TRUE : GLFW_FALSE);

    window_ = glfwCreateWindow(cfg.width, cfg.height, cfg.title.c_str(), nullptr, nullptr);
    if (!window_) {
        return core::err(core::ErrorCode::Io, "glfwCreateWindow failed");
    }

    glfwSetWindowUserPointer(window_, this);
    glfwMakeContextCurrent(window_);
    glfwSwapInterval(cfg.vsync ? 1 : 0);

    glfwSetFramebufferSizeCallback(window_, [](GLFWwindow* w, int width, int height) {
        auto* self = static_cast<Window*>(glfwGetWindowUserPointer(w));
        if (!self) return;
        self->width_  = width;
        self->height_ = height;
        if (self->on_resize_) self->on_resize_(width, height);
    });

    int fbw = 0, fbh = 0;
    glfwGetFramebufferSize(window_, &fbw, &fbh);
    width_  = fbw;
    height_ = fbh;
    return {};
}

void Window::destroy() {
    if (window_) {
        glfwDestroyWindow(window_);
        window_ = nullptr;
    }
}

void Window::pollEvents()       { glfwPollEvents(); }
void Window::swapBuffers()      { if (window_) glfwSwapBuffers(window_); }
void Window::makeContextCurrent() { if (window_) glfwMakeContextCurrent(window_); }

void Window::requestClose() noexcept {
    if (window_) glfwSetWindowShouldClose(window_, GLFW_TRUE);
}

bool Window::shouldClose() const noexcept {
    return window_ && glfwWindowShouldClose(window_);
}

void Window::setResizeCallback(ResizeFn fn) {
    on_resize_ = std::move(fn);
}

} // namespace soupmix::platform
