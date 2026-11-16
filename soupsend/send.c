// soupsend — takes what the playground draws and puts it on an NDI or Spout
// output.
//
// A browser cannot publish either, and that is not a gap to code around: NDI
// is a protocol on the network with no web API, and Spout is a DirectX shared
// texture, which a sandboxed tab has no business holding. So the page draws
// and sends pixels to this, and this does the publishing.
//
// It is also the web server, for the same reason pluginhost is:
//
//   - Safari refuses an http://127.0.0.1 subresource inside an https:// page
//     as mixed content, deliberately, so a page on the public site cannot
//     reach a local helper at all there.
//   - Chrome 142 gates public-site -> 127.0.0.1 behind a Local Network Access
//     prompt.
//
// Serve the page from the same place that takes the frames and both problems
// are absent: one origin, no mixed content, no prompt, no CORS. Open
// http://127.0.0.1:7788/playground.html and the Send control will find this.
//
// Build: make
// Run:   ./soupsend --sink ndi --name "LucidSoup"
#define _GNU_SOURCE
#include <arpa/inet.h>
#include <errno.h>
#include <fcntl.h>
#include <poll.h>
#include <signal.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <time.h>
#include <unistd.h>

#include "sha1.h"
#include "sink.h"

#define MAX_CONNS   16
#define HDR_MAX     16384
// 4K RGBA is 33MB. Anything larger than this is a mistake, not a frame.
#define FRAME_MAX   (40u * 1024u * 1024u)

static int   port = 7788;
static char  token[49];
static char  root[1024] = "..";          // the repo, so it serves the real page
static Sink *sink = NULL;
static volatile sig_atomic_t stop_now = 0;

static void say(const char *f, ...) {
    va_list a; va_start(a, f);
    fputs("soupsend: ", stderr); vfprintf(stderr, f, a); fputc('\n', stderr);
    va_end(a);
}
static void on_sig(int s) { (void)s; stop_now = 1; }

static uint64_t now_ms(void) {
    struct timespec ts; clock_gettime(CLOCK_MONOTONIC, &ts);
    return (uint64_t)ts.tv_sec * 1000 + ts.tv_nsec / 1000000;
}

static void gen_token(void) {
    uint8_t raw[24];
    FILE *f = fopen("/dev/urandom", "rb");
    if (!f || fread(raw, 1, sizeof raw, f) != sizeof raw) {
        // Never silently fall back to something guessable.
        say("cannot read /dev/urandom"); exit(1);
    }
    fclose(f);
    for (int i = 0; i < 24; i++) snprintf(token + i * 2, 3, "%02x", raw[i]);
    token[48] = 0;
}

/* ---------------- connections ---------------- */

typedef struct {
    int      fd;
    int      ws;                 // 0 while still HTTP, 1 once upgraded
    uint8_t *buf;
    size_t   len, cap;
    // A 4MB frame does not arrive as one WebSocket frame. Chromium splits a
    // large binary message across a first frame and continuations, and the
    // first version of this only looked at unfragmented ones — so the socket
    // connected, the page sent, and nothing whatsoever came out the far end.
    uint8_t *msg;
    size_t   mlen, mcap;
    int      mop;
    uint64_t frames;
} Conn;

static Conn conns[MAX_CONNS];

static void conn_drop(Conn *c) {
    if (c->fd >= 0) close(c->fd);
    free(c->buf);
    free(c->msg);
    memset(c, 0, sizeof *c);
    c->fd = -1;
}

static int buf_room(Conn *c, size_t need) {
    if (c->len + need <= c->cap) return 1;
    size_t want = c->cap ? c->cap : 8192;
    while (want < c->len + need) {
        if (want > FRAME_MAX) return 0;
        want *= 2;
    }
    uint8_t *n = realloc(c->buf, want);
    if (!n) return 0;
    c->buf = n; c->cap = want;
    return 1;
}

static void send_all(int fd, const void *p, size_t n) {
    const uint8_t *b = p;
    while (n) {
        ssize_t w = send(fd, b, n, MSG_NOSIGNAL);
        if (w <= 0) return;
        b += w; n -= (size_t)w;
    }
}

/* ---------------- http ---------------- */

static const char *mime_of(const char *path) {
    const char *d = strrchr(path, '.');
    if (!d) return "application/octet-stream";
    if (!strcmp(d, ".html")) return "text/html; charset=utf-8";
    if (!strcmp(d, ".js"))   return "text/javascript; charset=utf-8";
    if (!strcmp(d, ".css"))  return "text/css; charset=utf-8";
    if (!strcmp(d, ".json")) return "application/json; charset=utf-8";
    if (!strcmp(d, ".svg"))  return "image/svg+xml";
    if (!strcmp(d, ".png"))  return "image/png";
    if (!strcmp(d, ".jpg") || !strcmp(d, ".jpeg")) return "image/jpeg";
    if (!strcmp(d, ".webmanifest")) return "application/manifest+json";
    return "application/octet-stream";
}

static void http_text(int fd, int code, const char *status, const char *body) {
    char h[512];
    int n = snprintf(h, sizeof h,
        "HTTP/1.1 %d %s\r\nContent-Type: text/plain; charset=utf-8\r\n"
        "Content-Length: %zu\r\nConnection: close\r\n\r\n", code, status, strlen(body));
    send_all(fd, h, (size_t)n);
    send_all(fd, body, strlen(body));
}

// Find a header's value. Case-insensitive name, as HTTP requires.
static int hdr_get(const char *head, const char *name, char *out, size_t cap) {
    size_t nl = strlen(name);
    for (const char *p = head; (p = strchr(p, '\n')); ) {
        p++;
        if (strncasecmp(p, name, nl) || p[nl] != ':') continue;
        const char *v = p + nl + 1;
        while (*v == ' ' || *v == '\t') v++;
        const char *e = strpbrk(v, "\r\n");
        if (!e) return 0;
        size_t n = (size_t)(e - v);
        if (n >= cap) n = cap - 1;
        memcpy(out, v, n); out[n] = 0;
        return 1;
    }
    return 0;
}

// A page somewhere else must not be able to drive a program that publishes
// what is on your screen. Same-origin requests send our origin or none;
// anything else is another site using this browser.
static int origin_ok(const char *head) {
    char o[256];
    if (!hdr_get(head, "origin", o, sizeof o)) return 1;     // not a browser, or same-origin
    char a[64], b[64];
    snprintf(a, sizeof a, "http://127.0.0.1:%d", port);
    snprintf(b, sizeof b, "http://localhost:%d", port);
    return !strcmp(o, a) || !strcmp(o, b);
}

static void serve_file(int fd, const char *path) {
    // No climbing out of the served directory, however the path is spelled.
    if (strstr(path, "..")) { http_text(fd, 403, "Forbidden", "No."); return; }
    char full[2048];
    snprintf(full, sizeof full, "%s%s", root, (!strcmp(path, "/")) ? "/playground.html" : path);
    FILE *f = fopen(full, "rb");
    if (!f) { http_text(fd, 404, "Not Found", "Not here."); return; }
    struct stat st;
    if (fstat(fileno(f), &st) || !S_ISREG(st.st_mode)) { fclose(f); http_text(fd, 404, "Not Found", "Not a file."); return; }
    char h[512];
    int n = snprintf(h, sizeof h,
        "HTTP/1.1 200 OK\r\nContent-Type: %s\r\nContent-Length: %lld\r\n"
        "Cache-Control: no-store\r\nConnection: close\r\n\r\n",
        mime_of(full), (long long)st.st_size);
    send_all(fd, h, (size_t)n);
    char chunk[65536]; size_t r;
    while ((r = fread(chunk, 1, sizeof chunk, f)) > 0) send_all(fd, chunk, r);
    fclose(f);
}

static int ws_upgrade(Conn *c, const char *head, const char *target) {
    char key[128];
    if (!hdr_get(head, "sec-websocket-key", key, sizeof key)) return 0;

    const char *q = strchr(target, '?');
    char given[128] = "";
    if (q) {
        const char *t = strstr(q, "t=");
        if (t) {
            t += 2;
            size_t i = 0;
            while (t[i] && t[i] != '&' && i < sizeof given - 1) { given[i] = t[i]; i++; }
            given[i] = 0;
        }
    }
    if (strcmp(given, token)) {
        http_text(c->fd, 403, "Forbidden", "Wrong or missing token. Use the address soupsend printed.");
        return 0;
    }

    char cat[256];
    snprintf(cat, sizeof cat, "%s258EAFA5-E914-47DA-95CA-C5AB0DC85B11", key);
    uint8_t d[20]; char accept[64];
    sha1((const uint8_t *)cat, strlen(cat), d);
    base64(d, 20, accept);

    char h[512];
    int n = snprintf(h, sizeof h,
        "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
        "Sec-WebSocket-Accept: %s\r\n\r\n", accept);
    send_all(c->fd, h, (size_t)n);
    c->ws = 1;
    say("a page connected and is sending");
    return 1;
}

/* ---------------- the frames ---------------- */

// 16 bytes, then width*height*4 of RGBA. Little-endian, because every machine
// this will ever run on is.
static void take_frame(Conn *c, const uint8_t *p, size_t n) {
    if (n < 16 || memcmp(p, "SOUP", 4)) return;
    if (p[4] != 1) return;                                   // version
    unsigned w   = (unsigned)p[6]  | ((unsigned)p[7] << 8);
    unsigned h   = (unsigned)p[8]  | ((unsigned)p[9] << 8);
    uint64_t pts = (uint64_t)p[10] | ((uint64_t)p[11] << 8) |
                   ((uint64_t)p[12] << 16) | ((uint64_t)p[13] << 24);
    if (!w || !h) return;
    if ((size_t)w * h * 4 + 16 != n) {
        say("frame says %ux%u but carries %zu bytes — ignoring", w, h, n - 16);
        return;
    }
    if (sink->w != (int)w || sink->h != (int)h) {
        if (sink->w) sink->close(sink);
        if (sink->open(sink, (int)w, (int)h, 60)) { say("sink would not open"); return; }
        say("sending %ux%u", w, h);
    }
    sink->frame(sink, p + 16, (int)w, (int)h, pts);
    c->frames++;
}

// Returns bytes consumed, 0 when the frame is incomplete, -1 to drop the
// connection.
static long ws_one(Conn *c, uint8_t *p, size_t n) {
    if (n < 2) return 0;
    int fin = p[0] & 0x80, op = p[0] & 0x0f, masked = p[1] & 0x80;
    uint64_t len = p[1] & 0x7f;
    size_t off = 2;
    if (len == 126) { if (n < 4) return 0; len = ((uint64_t)p[2] << 8) | p[3]; off = 4; }
    else if (len == 127) {
        if (n < 10) return 0;
        len = 0;
        for (int i = 0; i < 8; i++) len = (len << 8) | p[2 + i];
        off = 10;
    }
    // Every frame from a browser is masked; one that is not did not come from
    // one, and RFC 6455 says to drop it.
    if (!masked) return -1;
    if (len > FRAME_MAX) return -1;
    if (n < off + 4 + len) return 0;
    uint8_t *mask = p + off;
    uint8_t *data = p + off + 4;
    for (uint64_t i = 0; i < len; i++) data[i] ^= mask[i & 3];

    // Control frames may be interleaved with a fragmented message, so they
    // are answered without touching the message being assembled.
    if (op == 0x8) return -1;                                // close
    if (op == 0x9) {                                         // ping -> pong
        uint8_t h2[2] = { 0x8a, (uint8_t)(len < 126 ? len : 0) };
        send_all(c->fd, h2, 2);
        if (len < 126) send_all(c->fd, data, (size_t)len);
        return (long)(off + 4 + len);
    }
    if (op == 0xa) return (long)(off + 4 + len);             // pong, ignored

    if (op == 0x1 || op == 0x2) { c->mop = op; c->mlen = 0; }
    else if (op != 0x0) return -1;                           // reserved opcode
    if (c->mop != 0x2) {                                     // text: not ours
        if (fin) c->mlen = 0;
        return (long)(off + 4 + len);
    }
    if (c->mlen + len > FRAME_MAX) return -1;
    if (c->mlen + len > c->mcap) {
        size_t want = c->mcap ? c->mcap : 65536;
        while (want < c->mlen + len) want *= 2;
        uint8_t *n2 = realloc(c->msg, want);
        if (!n2) return -1;
        c->msg = n2; c->mcap = want;
    }
    memcpy(c->msg + c->mlen, data, (size_t)len);
    c->mlen += (size_t)len;
    if (fin) { take_frame(c, c->msg, c->mlen); c->mlen = 0; }
    return (long)(off + 4 + len);
}

static void conn_readable(Conn *c) {
    if (!buf_room(c, 65536)) { conn_drop(c); return; }
    ssize_t r = recv(c->fd, c->buf + c->len, c->cap - c->len, 0);
    if (r <= 0) {
        if (c->ws) say("the page stopped sending after %llu frames", (unsigned long long)c->frames);
        conn_drop(c);
        return;
    }
    c->len += (size_t)r;

    if (!c->ws) {
        if (c->len >= HDR_MAX) { http_text(c->fd, 431, "Too Large", "Headers too long."); conn_drop(c); return; }
        c->buf[c->len] = 0;
        char *end = strstr((char *)c->buf, "\r\n\r\n");
        if (!end) return;
        char method[16] = {0}, target[1024] = {0};
        if (sscanf((char *)c->buf, "%15s %1023s", method, target) != 2) { conn_drop(c); return; }
        if (!origin_ok((char *)c->buf)) {
            http_text(c->fd, 403, "Forbidden", "This answers its own page only.");
            conn_drop(c); return;
        }
        char up[64];
        int wants_ws = hdr_get((char *)c->buf, "upgrade", up, sizeof up) && !strcasecmp(up, "websocket");
        if (wants_ws) {
            size_t used = (size_t)(end - (char *)c->buf) + 4;
            if (!ws_upgrade(c, (char *)c->buf, target)) { conn_drop(c); return; }
            memmove(c->buf, c->buf + used, c->len - used);
            c->len -= used;
        } else {
            char path[1024];
            snprintf(path, sizeof path, "%s", target);
            char *q = strchr(path, '?'); if (q) *q = 0;
            if (!strcmp(path, "/health")) {
                char b[256];
                snprintf(b, sizeof b, "{\"ok\":true,\"sink\":\"%s\",\"w\":%d,\"h\":%d}", sink->name, sink->w, sink->h);
                char hh[256];
                int hn = snprintf(hh, sizeof hh, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n"
                                 "Content-Length: %zu\r\nConnection: close\r\n\r\n", strlen(b));
                send_all(c->fd, hh, (size_t)hn); send_all(c->fd, b, strlen(b));
            } else {
                serve_file(c->fd, path);
            }
            conn_drop(c); return;
        }
    }

    for (;;) {
        long used = ws_one(c, c->buf, c->len);
        if (used < 0) { conn_drop(c); return; }
        if (used == 0) break;
        memmove(c->buf, c->buf + used, c->len - (size_t)used);
        c->len -= (size_t)used;
    }
}

/* ---------------- main ---------------- */

int main(int argc, char **argv) {
    const char *want = "test", *opt = NULL, *why = NULL;
    for (int i = 1; i < argc; i++) {
        if (!strcmp(argv[i], "--sink") && i + 1 < argc) want = argv[++i];
        else if (!strcmp(argv[i], "--name") && i + 1 < argc) opt = argv[++i];
        else if (!strcmp(argv[i], "--port") && i + 1 < argc) port = atoi(argv[++i]);
        else if (!strcmp(argv[i], "--root") && i + 1 < argc) snprintf(root, sizeof root, "%s", argv[++i]);
        else if (!strcmp(argv[i], "--token") && i + 1 < argc) snprintf(token, sizeof token, "%s", argv[++i]);
        else {
            printf("soupsend — put what the playground draws on an NDI or Spout output\n\n"
                   "  --sink ndi|spout|test   where the frames go (default test)\n"
                   "  --name NAME             the name it is published under\n"
                   "  --port N                listen on 127.0.0.1:N (default 7788)\n"
                   "  --root DIR              directory to serve the page from (default ..)\n"
                   "  --token TOK             use this token instead of a fresh random one\n");
            return !strcmp(argv[i], "--help") ? 0 : 1;
        }
    }
    if (!token[0]) gen_token();

    if      (!strcmp(want, "test"))  sink = sink_test_new(opt, &why);
    else if (!strcmp(want, "ndi"))   sink = sink_ndi_new(opt, &why);
    else if (!strcmp(want, "spout")) sink = sink_spout_new(opt, &why);
    else { say("no sink called '%s'", want); return 1; }
    if (!sink) { say("%s", why ? why : "that sink is not in this build"); return 1; }

    signal(SIGPIPE, SIG_IGN);
    signal(SIGINT, on_sig);
    signal(SIGTERM, on_sig);

    int srv = socket(AF_INET, SOCK_STREAM, 0);
    int one = 1;
    setsockopt(srv, SOL_SOCKET, SO_REUSEADDR, &one, sizeof one);
    struct sockaddr_in addr = {0};
    addr.sin_family = AF_INET;
    addr.sin_port = htons((uint16_t)port);
    // Loopback only, always. There is no flag to change this: a program that
    // publishes your screen has no business accepting strangers.
    addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    if (bind(srv, (struct sockaddr *)&addr, sizeof addr) < 0) {
        say("cannot listen on 127.0.0.1:%d — %s", port, strerror(errno)); return 1;
    }
    listen(srv, 8);
    for (int i = 0; i < MAX_CONNS; i++) conns[i].fd = -1;

    printf("\n  sink: %s\n\n  Open this, and only this:\n\n    http://127.0.0.1:%d/playground.html?send=%s\n\n",
           sink->name, port, token);
    fflush(stdout);

    while (!stop_now) {
        struct pollfd pfd[MAX_CONNS + 1];
        int n = 0;
        pfd[n].fd = srv; pfd[n].events = POLLIN; n++;
        int map[MAX_CONNS];
        for (int i = 0; i < MAX_CONNS; i++)
            if (conns[i].fd >= 0) { map[n - 1] = i; pfd[n].fd = conns[i].fd; pfd[n].events = POLLIN; n++; }
        if (poll(pfd, (nfds_t)n, 500) < 0) { if (errno == EINTR) continue; break; }
        if (pfd[0].revents & POLLIN) {
            int fd = accept(srv, NULL, NULL);
            if (fd >= 0) {
                int slot = -1;
                for (int i = 0; i < MAX_CONNS; i++) if (conns[i].fd < 0) { slot = i; break; }
                if (slot < 0) close(fd);
                else { memset(&conns[slot], 0, sizeof conns[slot]); conns[slot].fd = fd; }
            }
        }
        for (int i = 1; i < n; i++)
            if (pfd[i].revents) conn_readable(&conns[map[i - 1]]);
    }

    say("stopping");
    if (sink->w) sink->close(sink);
    close(srv);
    return 0;
}
