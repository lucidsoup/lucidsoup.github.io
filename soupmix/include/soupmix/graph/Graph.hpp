#pragma once

#include <memory>
#include <unordered_map>
#include <vector>

#include "soupmix/core/UUID.hpp"
#include "soupmix/graph/Link.hpp"
#include "soupmix/graph/Node.hpp"

namespace soupmix::graph {

class Graph {
public:
    Graph()  = default;
    ~Graph() = default;

    Graph(const Graph&)            = delete;
    Graph& operator=(const Graph&) = delete;

    // Returns a non-owning pointer; ownership stays with the Graph.
    Node* addNode(std::unique_ptr<Node> node);
    bool  removeNode(const core::UUID& id);
    [[nodiscard]] Node* node(const core::UUID& id) const;

    Link* addLink(PinRef from, PinRef to);
    bool  removeLink(const core::UUID& id);

    [[nodiscard]] const std::vector<std::unique_ptr<Node>>& nodes() const noexcept { return nodes_; }
    [[nodiscard]] const std::vector<Link>&                  links() const noexcept { return links_; }

    // Increments every time topology changes. Parameter edits do not bump
    // the generation; that's tracked separately on each Node.
    [[nodiscard]] u64 generation() const noexcept { return generation_; }

private:
    std::vector<std::unique_ptr<Node>>               nodes_;
    std::unordered_map<core::UUID, Node*>            by_uuid_;
    std::vector<Link>                                links_;
    u64                                              generation_ = 0;
};

} // namespace soupmix::graph
