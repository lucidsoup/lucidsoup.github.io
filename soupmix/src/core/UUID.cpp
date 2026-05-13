#include "soupmix/core/UUID.hpp"

#include <array>
#include <cstdio>
#include <cstring>
#include <random>
#include <stdexcept>

namespace soupmix::core {

namespace {

std::mt19937_64& rng() {
    static thread_local std::mt19937_64 engine{std::random_device{}()};
    return engine;
}

int hexValue(char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return 10 + (c - 'a');
    if (c >= 'A' && c <= 'F') return 10 + (c - 'A');
    return -1;
}

} // namespace

UUID UUID::generate() {
    std::array<std::uint8_t, 16> bytes{};
    std::uint64_t a = rng()();
    std::uint64_t b = rng()();
    std::memcpy(bytes.data(),     &a, 8);
    std::memcpy(bytes.data() + 8, &b, 8);

    // RFC 4122 v4.
    bytes[6] = static_cast<std::uint8_t>((bytes[6] & 0x0F) | 0x40);
    bytes[8] = static_cast<std::uint8_t>((bytes[8] & 0x3F) | 0x80);
    return UUID{bytes};
}

UUID UUID::parse(std::string_view text) {
    std::array<std::uint8_t, 16> bytes{};
    std::size_t                  bi = 0;
    int                          nibble = -1;
    for (char c : text) {
        if (c == '-') continue;
        int v = hexValue(c);
        if (v < 0) throw std::invalid_argument("UUID::parse: invalid character");
        if (nibble < 0) {
            nibble = v;
        } else {
            if (bi >= 16) throw std::invalid_argument("UUID::parse: too many bytes");
            bytes[bi++] = static_cast<std::uint8_t>((nibble << 4) | v);
            nibble = -1;
        }
    }
    if (bi != 16 || nibble != -1) {
        throw std::invalid_argument("UUID::parse: wrong length");
    }
    return UUID{bytes};
}

std::string UUID::toString() const {
    char buf[37];
    std::snprintf(buf, sizeof(buf),
        "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
        bytes_[0], bytes_[1], bytes_[2],  bytes_[3],
        bytes_[4], bytes_[5], bytes_[6],  bytes_[7],
        bytes_[8], bytes_[9], bytes_[10], bytes_[11],
        bytes_[12], bytes_[13], bytes_[14], bytes_[15]);
    return std::string(buf);
}

bool UUID::isNil() const noexcept {
    for (auto b : bytes_) if (b != 0) return false;
    return true;
}

} // namespace soupmix::core

std::size_t std::hash<soupmix::core::UUID>::operator()(const soupmix::core::UUID& id) const noexcept {
    const auto& b = id.bytes();
    std::uint64_t lo, hi;
    std::memcpy(&lo, b.data(),     8);
    std::memcpy(&hi, b.data() + 8, 8);
    return std::hash<std::uint64_t>{}(lo) ^ (std::hash<std::uint64_t>{}(hi) << 1);
}
