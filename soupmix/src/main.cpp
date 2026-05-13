#include <cstdio>
#include <cstdlib>

#include "soupmix/app/CommandLine.hpp"
#include "soupmix/app/EditorApp.hpp"
#include "soupmix/debug/Log.hpp"

int main(int argc, char** argv) {
    soupmix::debug::initLogging();

    auto parsed = soupmix::app::parseCommandLine(argc, argv);
    if (!parsed) {
        std::fprintf(stderr, "error: %s\n", parsed.error().message.c_str());
        soupmix::app::printHelp(argv[0]);
        return EXIT_FAILURE;
    }

    if (parsed.value().print_help) {
        soupmix::app::printHelp(argv[0]);
        return EXIT_SUCCESS;
    }

    soupmix::app::EditorApp editor(std::move(parsed.value().config));
    return editor.run();
}
