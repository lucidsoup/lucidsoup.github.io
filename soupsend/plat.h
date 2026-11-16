// The handful of places Windows differs, in one file.
//
// soupsend is BSD sockets and poll(), which is most of a web server and all
// of the parts Windows spells differently. Rather than scatter #ifdefs
// through send.c, every difference is mapped here and send.c goes on reading
// like the POSIX program it is.
//
// Why bother: Spout only exists on Windows. sink_spout.cpp compiled long
// before any of this, and was useless, because the program around it would
// not build there at all.
#ifndef SOUPSEND_PLAT_H
#define SOUPSEND_PLAT_H

#ifdef _WIN32

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <winsock2.h>
#include <ws2tcpip.h>
#include <bcrypt.h>
#include <io.h>
#include <sys/stat.h>
#include <stdio.h>

typedef SOCKET sock_t;
typedef int    socklen_t_compat;
#define SOCK_BAD        INVALID_SOCKET
#define sock_valid(s)   ((s) != INVALID_SOCKET)
#define sock_close(s)   closesocket(s)
// Windows has no SIGPIPE, so there is nothing to suppress.
#define SEND_FLAGS      0
#define plat_poll       WSAPoll
#define plat_pollfd     WSAPOLLFD
typedef unsigned long   plat_nfds_t;
#define strncasecmp     _strnicmp
#define strcasecmp      _stricmp
// recv/send return int here, not ssize_t.
typedef int             rwret_t;

// S_ISREG is POSIX; the bits exist under other names.
#ifndef S_ISREG
#define S_ISREG(m) (((m) & _S_IFMT) == _S_IFREG)
#endif

static inline int plat_start(void) {
    WSADATA w;
    return WSAStartup(MAKEWORD(2, 2), &w) == 0;
}
static inline void plat_stop(void) { WSACleanup(); }

// There is no /dev/urandom. BCryptGenRandom is the supported way to get
// bytes worth using for a token, and it is in every Windows since Vista.
static inline int plat_random(unsigned char *out, unsigned n) {
    return BCryptGenRandom(NULL, out, n, BCRYPT_USE_SYSTEM_PREFERRED_RNG) == 0;
}

// clock_gettime is declared by mingw but lives in winpthreads, and pulling a
// threading library in for a millisecond counter is a poor trade.
static inline unsigned long long plat_ms(void) { return GetTickCount64(); }

#else   /* POSIX */

#include <arpa/inet.h>
#include <fcntl.h>
#include <poll.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <unistd.h>
#include <time.h>

typedef int     sock_t;
#define SOCK_BAD        (-1)
#define sock_valid(s)   ((s) >= 0)
#define sock_close(s)   close(s)
#define SEND_FLAGS      MSG_NOSIGNAL
#define plat_poll       poll
#define plat_pollfd     struct pollfd
typedef nfds_t  plat_nfds_t;
typedef ssize_t rwret_t;

static inline int plat_start(void) { return 1; }
static inline void plat_stop(void) { }

static inline unsigned long long plat_ms(void) {
    struct timespec ts; clock_gettime(CLOCK_MONOTONIC, &ts);
    return (unsigned long long)ts.tv_sec * 1000 + ts.tv_nsec / 1000000;
}

static inline int plat_random(unsigned char *out, unsigned n) {
    FILE *f = fopen("/dev/urandom", "rb");
    if (!f) return 0;
    int ok = fread(out, 1, n, f) == n;
    fclose(f);
    return ok;
}

#endif
#endif
