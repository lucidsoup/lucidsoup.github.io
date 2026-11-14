// The sink that exists so the rest can be trusted.
//
// NDI needs a licensed SDK download and Spout is Windows-only, so neither can
// be built or run everywhere. This one builds anywhere, and it proves the part
// that is actually easy to get wrong: that frames arrive whole, the right size,
// the right way up, at the right rate, with the colours in the right order.
//
//   --name stats           counts and times frames (default)
//   --name /path/dir       also writes every 30th frame as a .ppm you can look at
#include "sink.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

typedef struct {
    char     dir[512];
    uint64_t n, bytes;
    uint64_t t0, tlast;
    uint8_t  first_px[4], centre_px[4];
} Test;

static uint64_t ms(void) {
    struct timespec ts; clock_gettime(CLOCK_MONOTONIC, &ts);
    return (uint64_t)ts.tv_sec * 1000 + ts.tv_nsec / 1000000;
}

static int t_open(Sink *s, int w, int h, int fps) {
    Test *t = s->priv;
    s->w = w; s->h = h; s->fps = fps;
    t->t0 = t->tlast = ms();
    fprintf(stderr, "soupsend[test]: opened %dx%d\n", w, h);
    return 0;
}

// Written beside the frames so a test can read what actually arrived without
// parsing a log line.
static void t_stamp(Test *t, int w, int h, uint64_t pts) {
    if (!t->dir[0]) return;
    char p[600];
    snprintf(p, sizeof p, "%s/last.txt", t->dir);
    FILE *f = fopen(p, "w");
    if (!f) return;
    fprintf(f, "{\"frames\":%llu,\"w\":%d,\"h\":%d,\"pts\":%llu,\"topleft\":[%u,%u,%u,%u]}\n",
            (unsigned long long)t->n, w, h, (unsigned long long)pts,
            t->first_px[0], t->first_px[1], t->first_px[2], t->first_px[3]);
    fclose(f);
}

static int t_frame(Sink *s, const uint8_t *rgba, int w, int h, uint64_t pts) {
    Test *t = s->priv;
    t->n++;
    t->bytes += (uint64_t)w * h * 4;
    memcpy(t->first_px, rgba, 4);
    memcpy(t->centre_px, rgba + ((size_t)(h / 2) * w + w / 2) * 4, 4);

    uint64_t now = ms();
    if (now - t->tlast >= 1000) {
        double secs = (double)(now - t->t0) / 1000.0;
        fprintf(stderr, "soupsend[test]: %llu frames, %.1f fps, %.1f MB/s, "
                        "top-left rgba(%u,%u,%u,%u) centre rgba(%u,%u,%u,%u)\n",
                (unsigned long long)t->n, (double)t->n / (secs ? secs : 1),
                (double)t->bytes / (secs ? secs : 1) / 1048576.0,
                t->first_px[0], t->first_px[1], t->first_px[2], t->first_px[3],
                t->centre_px[0], t->centre_px[1], t->centre_px[2], t->centre_px[3]);
        t->tlast = now;
    }
    t_stamp(t, w, h, pts);
    if (t->dir[0] && t->n % 30 == 1) {
        char p[600];
        snprintf(p, sizeof p, "%s/frame-%06llu.ppm", t->dir, (unsigned long long)t->n);
        FILE *f = fopen(p, "wb");
        if (f) {
            fprintf(f, "P6\n%d %d\n255\n", w, h);
            // PPM is RGB; drop alpha rather than let a viewer guess at it.
            for (size_t i = 0; i < (size_t)w * h; i++) fwrite(rgba + i * 4, 1, 3, f);
            fclose(f);
        }
    }
    return 0;
}

static void t_close(Sink *s) {
    Test *t = s->priv;
    fprintf(stderr, "soupsend[test]: closed after %llu frames\n", (unsigned long long)t->n);
    s->w = s->h = 0;
}

Sink *sink_test_new(const char *opt, const char **why) {
    (void)why;
    Sink *s = calloc(1, sizeof *s);
    Test *t = calloc(1, sizeof *t);
    if (!s || !t) { free(s); free(t); return NULL; }
    if (opt && opt[0] == '/') snprintf(t->dir, sizeof t->dir, "%s", opt);
    s->name = "test"; s->priv = t;
    s->open = t_open; s->frame = t_frame; s->close = t_close;
    return s;
}
