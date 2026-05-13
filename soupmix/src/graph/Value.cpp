#include "soupmix/graph/Value.hpp"

namespace soupmix::graph {

PinType pinTypeOf(const Value& v) noexcept {
    return std::visit([](auto&& arg) -> PinType {
        using T = std::decay_t<decltype(arg)>;
        if constexpr (std::is_same_v<T, const render::Texture*>) return PinType::Texture;
        else if constexpr (std::is_same_v<T, f32>)                 return PinType::Float;
        else if constexpr (std::is_same_v<T, glm::vec2>)           return PinType::Vec2;
        else if constexpr (std::is_same_v<T, glm::vec3>)           return PinType::Vec3;
        else if constexpr (std::is_same_v<T, glm::vec4>)           return PinType::Vec4;
        else if constexpr (std::is_same_v<T, const mapping::Surface*>) return PinType::Surface;
        else if constexpr (std::is_same_v<T, bool>)                return PinType::Trigger;
        else if constexpr (std::is_same_v<T, BeatValue>)           return PinType::Beat;
        else                                                       return PinType::Float;
    }, v);
}

const char* pinTypeName(PinType t) noexcept {
    switch (t) {
        case PinType::Texture: return "Texture";
        case PinType::Float:   return "Float";
        case PinType::Vec2:    return "Vec2";
        case PinType::Vec3:    return "Vec3";
        case PinType::Vec4:    return "Vec4";
        case PinType::Color:   return "Color";
        case PinType::Surface: return "Surface";
        case PinType::Trigger: return "Trigger";
        case PinType::Beat:    return "Beat";
    }
    return "?";
}

} // namespace soupmix::graph
