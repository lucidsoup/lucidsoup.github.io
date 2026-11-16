// What a destination for frames has to be able to do.
//
// Three exist: NDI (any machine on the network), Spout (Windows, same
// machine, no network), and a test sink that writes what it is given so the
// transport can be proved without either SDK present.
//
// Frames arrive as tightly packed RGBA8, top-left origin — which is what a 2D
// canvas readback hands over, so the browser does no conversion. Whatever a
// sink's own API wants, it converts; the page should not have to know.
#ifndef SOUPSEND_SINK_H
#define SOUPSEND_SINK_H

#include <stddef.h>
#include <stdint.h>

typedef struct Sink Sink;

struct Sink {
    const char *name;
    // Called once the first frame's size is known, and again if it changes.
    int  (*open)(Sink *s, int w, int h, int fps);
    // rgba is w*h*4 bytes. Returns 0 on success.
    int  (*frame)(Sink *s, const uint8_t *rgba, int w, int h, uint64_t pts_ms);
    void (*close)(Sink *s);
    void *priv;
    int   w, h, fps;
};

// Each of these returns NULL when that sink is not built into this binary,
// with the reason in *why — so `soupsend --sink ndi` on a build without the
// SDK says so rather than failing somewhere less obvious.
Sink *sink_test_new(const char *opt, const char **why);
Sink *sink_ndi_new(const char *opt, const char **why);
Sink *sink_spout_new(const char *opt, const char **why);

#endif
