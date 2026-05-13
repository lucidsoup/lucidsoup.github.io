#pragma once

#include <spdlog/spdlog.h>

#include <memory>

namespace soupmix::debug {

void initLogging();

[[nodiscard]] std::shared_ptr<spdlog::logger> logger();

} // namespace soupmix::debug

#define SOUPMIX_TRACE(...) ::soupmix::debug::logger()->trace(__VA_ARGS__)
#define SOUPMIX_DEBUG(...) ::soupmix::debug::logger()->debug(__VA_ARGS__)
#define SOUPMIX_INFO(...)  ::soupmix::debug::logger()->info(__VA_ARGS__)
#define SOUPMIX_WARN(...)  ::soupmix::debug::logger()->warn(__VA_ARGS__)
#define SOUPMIX_ERROR(...) ::soupmix::debug::logger()->error(__VA_ARGS__)
