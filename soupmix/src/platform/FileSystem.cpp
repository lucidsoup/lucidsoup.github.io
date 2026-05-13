#include "soupmix/platform/FileSystem.hpp"

#include <fstream>
#include <sstream>
#include <system_error>

namespace soupmix::platform {

core::Result<std::string> readTextFile(const std::filesystem::path& path) {
    std::ifstream f(path);
    if (!f) return core::err(core::ErrorCode::Io, "failed to open: " + path.string());
    std::ostringstream ss;
    ss << f.rdbuf();
    return ss.str();
}

core::Result<std::vector<unsigned char>> readBinaryFile(const std::filesystem::path& path) {
    std::ifstream f(path, std::ios::binary | std::ios::ate);
    if (!f) return core::err(core::ErrorCode::Io, "failed to open: " + path.string());
    const auto size = static_cast<std::size_t>(f.tellg());
    std::vector<unsigned char> buf(size);
    f.seekg(0);
    f.read(reinterpret_cast<char*>(buf.data()), static_cast<std::streamsize>(size));
    return buf;
}

core::Result<void> writeTextFile(const std::filesystem::path& path, std::string_view text) {
    std::ofstream f(path, std::ios::binary);
    if (!f) return core::err(core::ErrorCode::Io, "failed to write: " + path.string());
    f.write(text.data(), static_cast<std::streamsize>(text.size()));
    return {};
}

bool fileExists(const std::filesystem::path& path) {
    std::error_code ec;
    return std::filesystem::exists(path, ec);
}

core::Result<void> ensureDirectory(const std::filesystem::path& path) {
    std::error_code ec;
    std::filesystem::create_directories(path, ec);
    if (ec) return core::err(core::ErrorCode::Io, ec.message());
    return {};
}

} // namespace soupmix::platform
