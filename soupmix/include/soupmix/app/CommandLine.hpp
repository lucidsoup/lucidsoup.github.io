#pragma once

#include <string>
#include <vector>

#include "soupmix/core/Config.hpp"
#include "soupmix/core/Result.hpp"

namespace soupmix::app {

struct ParsedCommandLine {
    core::Config config;
    bool         show_mode    = false;   // --show: headless, full-screen output
    bool         print_help   = false;
    bool         print_version = false;
};

[[nodiscard]] core::Result<ParsedCommandLine> parseCommandLine(int argc, char** argv);

void printHelp(const char* program_name);

} // namespace soupmix::app
