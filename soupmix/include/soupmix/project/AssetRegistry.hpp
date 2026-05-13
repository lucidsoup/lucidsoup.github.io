#pragma once

#include <filesystem>
#include <memory>
#include <string>
#include <unordered_map>

#include "soupmix/core/UUID.hpp"

namespace soupmix::render { class Texture; }

namespace soupmix::project {

// Owns loaded textures / video decoders / etc. keyed by asset UUID.
// Assets are referenced from nodes by UUID rather than by path.
class AssetRegistry {
public:
    AssetRegistry();
    ~AssetRegistry();

    AssetRegistry(const AssetRegistry&)            = delete;
    AssetRegistry& operator=(const AssetRegistry&) = delete;

    [[nodiscard]] core::UUID importImage(const std::filesystem::path& path);
    [[nodiscard]] core::UUID importVideo(const std::filesystem::path& path);

    [[nodiscard]] render::Texture* texture(const core::UUID& id) const;

    void clear();

private:
    struct Entry;
    std::unordered_map<core::UUID, std::unique_ptr<Entry>> assets_;
};

} // namespace soupmix::project
