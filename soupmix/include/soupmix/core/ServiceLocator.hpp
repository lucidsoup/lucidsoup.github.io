#pragma once

#include <memory>
#include <typeindex>
#include <unordered_map>

namespace soupmix::core {

// Simple type-keyed service registry. Owned by App.
//
// Services are non-owning pointers: the registry does not delete them.
// This keeps lifetimes obvious and the dependency direction explicit
// (App owns the concrete service; subsystems look it up by type).
class ServiceLocator {
public:
    template <typename T>
    void provide(T* service) { services_[typeid(T)] = service; }

    template <typename T>
    [[nodiscard]] T* get() const {
        auto it = services_.find(typeid(T));
        return it == services_.end() ? nullptr : static_cast<T*>(it->second);
    }

    void clear() { services_.clear(); }

private:
    std::unordered_map<std::type_index, void*> services_;
};

} // namespace soupmix::core
