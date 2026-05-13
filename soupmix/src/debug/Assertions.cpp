#include "soupmix/debug/Assertions.hpp"

#include <cstdio>
#include <cstdlib>

namespace soupmix::debug {

[[noreturn]] void onAssertFailed(const char* expr, const char* file, int line, const char* msg) {
    std::fprintf(stderr, "soupmix assertion failed: %s\n  at %s:%d\n  %s\n",
                 expr, file, line, msg ? msg : "");
    std::abort();
}

} // namespace soupmix::debug
