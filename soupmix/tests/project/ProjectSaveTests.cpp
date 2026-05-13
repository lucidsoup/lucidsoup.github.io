#include <gtest/gtest.h>

#include <filesystem>

#include "soupmix/project/Project.hpp"
#include "soupmix/project/ProjectSaver.hpp"

using namespace soupmix;

TEST(ProjectSave, WritesProjectJson) {
    project::Project p;
    p.manifest().name            = "test";
    p.manifest().soupmix_version = "0.1.0";
    p.manifest().project_version = 1;

    const auto dir = std::filesystem::temp_directory_path() / "soupmix-test-save";
    std::filesystem::remove_all(dir);

    project::ProjectSaver saver;
    ASSERT_TRUE(saver.save(p, dir).ok());
    EXPECT_TRUE(std::filesystem::exists(dir / "project.json"));
}
