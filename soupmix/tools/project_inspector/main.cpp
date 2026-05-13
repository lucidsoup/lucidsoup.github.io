#include <cstdio>

#include "soupmix/graph/NodeRegistry.hpp"
#include "soupmix/project/Project.hpp"
#include "soupmix/project/ProjectLoader.hpp"

int main(int argc, char** argv) {
    if (argc < 2) {
        std::fprintf(stderr, "usage: project_inspector <project-dir>\n");
        return 1;
    }
    soupmix::graph::NodeRegistry registry;
    soupmix::graph::registerBuiltinNodes(registry);
    soupmix::project::ProjectLoader loader(registry);
    auto r = loader.load(argv[1]);
    if (!r) {
        std::fprintf(stderr, "load failed: %s\n", r.error().message.c_str());
        return 1;
    }
    const auto& m = r.value()->manifest();
    std::printf("name:    %s\n", m.name.c_str());
    std::printf("version: %s (project %d)\n", m.soupmix_version.c_str(), m.project_version);
    return 0;
}
