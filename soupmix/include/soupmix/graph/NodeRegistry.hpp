#pragma once

#include <functional>
#include <memory>
#include <string>
#include <unordered_map>
#include <vector>

#include "soupmix/graph/Node.hpp"

namespace soupmix::graph {

using NodeFactory = std::function<std::unique_ptr<Node>()>;

class NodeRegistry {
public:
    struct Entry {
        NodeMeta    meta;
        NodeFactory factory;
    };

    void registerKind(NodeMeta meta, NodeFactory factory);

    [[nodiscard]] std::unique_ptr<Node>  create(const std::string& kind) const;
    [[nodiscard]] const Entry*           find(const std::string& kind) const;
    [[nodiscard]] std::vector<const Entry*> all() const;

private:
    std::unordered_map<std::string, Entry> kinds_;
};

// Populates the registry with all node kinds shipped with the engine.
void registerBuiltinNodes(NodeRegistry& registry);

} // namespace soupmix::graph
