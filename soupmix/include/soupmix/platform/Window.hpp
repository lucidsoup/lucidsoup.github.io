#pragma once

#include <functional>
#include <string>

#include "soupmix/core/Result.hpp"
#include "soupmix/core/Types.hpp"

struct GLFWwindow;

namespace soupmix::platform {

struct WindowConfig {
    int         width   = 1600;
    int         height  = 900;
    std::string title   = "soupmix";
    bool        vsync   = true;
    bool        decorated = true;
    bool        visible   = true;
};

class Window {
public:
    Window();
    ~Window();

    Window(const Window&)            = delete;
    Window& operator=(const Window&) = delete;

    [[nodiscard]] core::Result<void> create(const WindowConfig& cfg);
    void                             destroy();

    void pollEvents();
    void swapBuffers();
    void makeContextCurrent();
    void requestClose() noexcept;

    [[nodiscard]] bool shouldClose() const noexcept;
    [[nodiscard]] i32  width()      const noexcept { return width_;  }
    [[nodiscard]] i32  height()     const noexcept { return height_; }
    [[nodiscard]] GLFWwindow* handle() const noexcept { return window_; }

    // Resize callback. Receives new framebuffer size in pixels.
    using ResizeFn = std::function<void(i32 width, i32 height)>;
    void setResizeCallback(ResizeFn fn);

private:
    GLFWwindow* window_ = nullptr;
    i32         width_  = 0;
    i32         height_ = 0;
    ResizeFn    on_resize_;
};

} // namespace soupmix::platform
