#include "soupmix/project/AssetRegistry.hpp"

#include "soupmix/render/Texture.hpp"

namespace soupmix::project {

struct AssetRegistry::Entry {
    enum class Kind { Image, Video };
    Kind                              kind = Kind::Image;
    std::filesystem::path             path;
    std::unique_ptr<render::Texture>  texture;
};

AssetRegistry::AssetRegistry()  = default;
AssetRegistry::~AssetRegistry() = default;

core::UUID AssetRegistry::importImage(const std::filesystem::path& path) {
    auto entry = std::make_unique<Entry>();
    entry->kind = Entry::Kind::Image;
    entry->path = path;
    const auto id = core::UUID::generate();
    assets_.emplace(id, std::move(entry));
    return id;
}

core::UUID AssetRegistry::importVideo(const std::filesystem::path& path) {
    auto entry = std::make_unique<Entry>();
    entry->kind = Entry::Kind::Video;
    entry->path = path;
    const auto id = core::UUID::generate();
    assets_.emplace(id, std::move(entry));
    return id;
}

render::Texture* AssetRegistry::texture(const core::UUID& id) const {
    auto it = assets_.find(id);
    return it == assets_.end() ? nullptr : it->second->texture.get();
}

void AssetRegistry::clear() {
    assets_.clear();
}

} // namespace soupmix::project
