#include <gtest/gtest.h>

#include "soupmix/graph/Graph.hpp"

using namespace soupmix;

TEST(GraphCycle, AddRemoveBumpsGeneration) {
    graph::Graph g;
    const auto gen0 = g.generation();
    g.addLink(graph::PinRef{core::UUID::generate(), core::UUID::generate()},
               graph::PinRef{core::UUID::generate(), core::UUID::generate()});
    EXPECT_GT(g.generation(), gen0);
}
