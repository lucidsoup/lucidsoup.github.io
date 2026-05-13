#pragma once

#include <cstdlib>

#include "soupmix/debug/Log.hpp"

namespace soupmix::debug {

[[noreturn]] void onAssertFailed(const char* expr, const char* file, int line, const char* msg);

} // namespace soupmix::debug

#define SOUPMIX_ASSERT(expr)                                                  \
    do {                                                                      \
        if (!(expr)) {                                                        \
            ::soupmix::debug::onAssertFailed(#expr, __FILE__, __LINE__, "");  \
        }                                                                     \
    } while (0)

#define SOUPMIX_ASSERT_MSG(expr, msg)                                         \
    do {                                                                      \
        if (!(expr)) {                                                        \
            ::soupmix::debug::onAssertFailed(#expr, __FILE__, __LINE__, msg); \
        }                                                                     \
    } while (0)
