#include "soupmix/graph/Graph.hpp"

#include <algorithm>

namespace soupmix::graph {

Node* Graph::addNode(std::unique_ptr<Node> node) {
    if (!node) return nullptr;
    if (node->uuid().isNil()) node->setUuid(core::UUID::generate());
    Node* raw = node.get();
    by_uuid_[node->uuid()] = raw;
    nodes_.push_back(std::move(node));
    ++generation_;
    return raw;
}

bool Graph::removeNode(const core::UUID& id) {
    auto it = std::find_if(nodes_.begin(), nodes_.end(),
        [&](const auto& n) { return n->uuid() == id; });
    if (it == nodes_.end()) return false;

    links_.erase(std::remove_if(links_.begin(), links_.end(),
        [&](const Link& l) { return l.from.node == id || l.to.node == id; }),
        links_.end());

    by_uuid_.erase(id);
    nodes_.erase(it);
    ++generation_;
    return true;
}

Node* Graph::node(const core::UUID& id) const {
    auto it = by_uuid_.find(id);
    return it == by_uuid_.end() ? nullptr : it->second;
}

Link* Graph::addLink(PinRef from, PinRef to) {
    Link link;
    link.uuid = core::UUID::generate();
    link.from = from;
    link.to   = to;
    links_.push_back(link);
    ++generation_;
    return &links_.back();
}

bool Graph::removeLink(const core::UUID& id) {
    auto it = std::find_if(links_.begin(), links_.end(),
        [&](const Link& l) { return l.uuid == id; });
    if (it == links_.end()) return false;
    links_.erase(it);
    ++generation_;
    return true;
}

} // namespace soupmix::graph
