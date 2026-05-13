#pragma once

#include <glm/vec2.hpp>

#include "soupmix/core/Types.hpp"

namespace soupmix::platform {

enum class Key : i32 {
    Unknown = 0,
    Space = 32, Apostrophe = 39, Comma = 44, Minus = 45, Period = 46, Slash = 47,
    Num0 = 48, Num9 = 57,
    A = 65, Z = 90,
    Escape = 256, Enter = 257, Tab = 258, Backspace = 259,
    Right = 262, Left = 263, Down = 264, Up = 265,
    F1 = 290, F12 = 301,
    LeftShift = 340, LeftControl = 341, LeftAlt = 342, LeftSuper = 343,
};

enum class MouseButton : i32 {
    Left = 0, Right = 1, Middle = 2,
};

struct InputSnapshot {
    glm::vec2 mouse_pos    {0.0f, 0.0f};
    glm::vec2 mouse_delta  {0.0f, 0.0f};
    glm::vec2 scroll_delta {0.0f, 0.0f};
    bool      mouse[8]     {false};
    bool      keys[512]    {false};
};

} // namespace soupmix::platform
