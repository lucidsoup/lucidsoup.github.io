#include <gtest/gtest.h>

#include "soupmix/graph/Graph.hpp"
#include "soupmix/graph/GraphCompiler.hpp"

using namespace soupmix;

TEST(GraphCompile, EmptyGraphProducesEmptyRenderGraph) {
    graph::Graph         g;
    graph::GraphCompiler compiler;
    auto result = compiler.compile(g);
    ASSERT_TRUE(result.ok());
    EXPECT_TRUE(result.value().passes.empty());
}

TEST(GraphCompile, GenerationCachedAfterCompile) {
    graph::Graph         g;
    graph::GraphCompiler compiler;
    ASSERT_TRUE(compiler.compile(g).ok());
    EXPECT_EQ(compiler.lastGeneration(), g.generation());
}
