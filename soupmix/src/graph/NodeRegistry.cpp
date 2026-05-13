#include "soupmix/graph/NodeRegistry.hpp"

#include "soupmix/nodes/FxNodes.hpp"
#include "soupmix/nodes/MappingNodes.hpp"
#include "soupmix/nodes/OutputNodes.hpp"
#include "soupmix/nodes/SourceNodes.hpp"
#include "soupmix/nodes/UtilityNodes.hpp"

namespace soupmix::graph {

void NodeRegistry::registerKind(NodeMeta meta, NodeFactory factory) {
    Entry e;
    e.meta    = std::move(meta);
    e.factory = std::move(factory);
    kinds_.emplace(e.meta.kind, std::move(e));
}

std::unique_ptr<Node> NodeRegistry::create(const std::string& kind) const {
    auto it = kinds_.find(kind);
    if (it == kinds_.end() || !it->second.factory) return nullptr;
    auto node = it->second.factory();
    if (node) node->setUuid(core::UUID::generate());
    return node;
}

const NodeRegistry::Entry* NodeRegistry::find(const std::string& kind) const {
    auto it = kinds_.find(kind);
    return it == kinds_.end() ? nullptr : &it->second;
}

std::vector<const NodeRegistry::Entry*> NodeRegistry::all() const {
    std::vector<const Entry*> out;
    out.reserve(kinds_.size());
    for (const auto& [_, e] : kinds_) out.push_back(&e);
    return out;
}

void registerBuiltinNodes(NodeRegistry& registry) {
    nodes::registerSourceNodes (registry);
    nodes::registerFxNodes     (registry);
    nodes::registerUtilityNodes(registry);
    nodes::registerOutputNodes (registry);
    nodes::registerMappingNodes(registry);
}

} // namespace soupmix::graph
