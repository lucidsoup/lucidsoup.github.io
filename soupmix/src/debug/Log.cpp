#include "soupmix/debug/Log.hpp"

#include <spdlog/sinks/stdout_color_sinks.h>

namespace soupmix::debug {

namespace {
std::shared_ptr<spdlog::logger> g_logger;
}

void initLogging() {
    if (g_logger) return;
    g_logger = spdlog::stdout_color_mt("soupmix");
    g_logger->set_level(spdlog::level::debug);
    g_logger->set_pattern("[%H:%M:%S.%e] [%^%l%$] %v");
    spdlog::set_default_logger(g_logger);
}

std::shared_ptr<spdlog::logger> logger() {
    if (!g_logger) initLogging();
    return g_logger;
}

} // namespace soupmix::debug
