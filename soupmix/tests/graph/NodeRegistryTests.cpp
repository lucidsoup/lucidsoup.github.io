#include <gtest/gtest.h>

#include "soupmix/graph/NodeRegistry.hpp"

using namespace soupmix;

TEST(NodeRegistry, RegisterBuiltinIncludesSolidColor) {
    graph::NodeRegistry r;
    graph::registerBuiltinNodes(r);
    EXPECT_NE(r.find("solid_color"), nullptr);
}

TEST(NodeRegistry, FactoryProducesNodeWithUuid) {
    graph::NodeRegistry r;
    graph::registerBuiltinNodes(r);
    auto node = r.create("solid_color");
    ASSERT_NE(node, nullptr);
    EXPECT_FALSE(node->uuid().isNil());
    EXPECT_EQ(node->meta().kind, "solid_color");
}
