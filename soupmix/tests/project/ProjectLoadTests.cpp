#include <gtest/gtest.h>

#include "soupmix/graph/NodeRegistry.hpp"
#include "soupmix/project/ProjectLoader.hpp"

using namespace soupmix;

TEST(ProjectLoad, ReturnsErrorOnMissingManifest) {
    graph::NodeRegistry r;
    graph::registerBuiltinNodes(r);
    project::ProjectLoader loader(r);
    auto result = loader.load("/nonexistent/path/to/project");
    EXPECT_FALSE(result.ok());
    EXPECT_EQ(result.error().code, core::ErrorCode::NotFound);
}
