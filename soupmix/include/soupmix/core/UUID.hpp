#pragma once

#include <array>
#include <compare>
#include <cstdint>
#include <string>
#include <string_view>

namespace soupmix::core {

class UUID {
public:
    constexpr UUID() = default;
    explicit constexpr UUID(std::array<std::uint8_t, 16> bytes) : bytes_(bytes) {}

    static UUID generate();
    static UUID parse(std::string_view text);   // throws std::invalid_argument on bad input

    [[nodiscard]] std::string toString() const;
    [[nodiscard]] bool        isNil() const noexcept;

    [[nodiscard]] const std::array<std::uint8_t, 16>& bytes() const noexcept { return bytes_; }

    auto operator<=>(const UUID&) const = default;

private:
    std::array<std::uint8_t, 16> bytes_{};
};

} // namespace soupmix::core

namespace std {
template <>
struct hash<soupmix::core::UUID> {
    std::size_t operator()(const soupmix::core::UUID& id) const noexcept;
};
} // namespace std
