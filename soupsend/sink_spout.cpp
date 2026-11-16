// Spout out — Windows only.
//
// NOT COMPILED OR RUN WHERE THIS WAS WRITTEN. Spout is a DirectX shared
// texture, so it cannot exist on the Linux machine this was built on, and
// this file has never been through a compiler. The shape is right and the
// calls come from Spout's own documented SpoutDX class, but expect to fix
// something the first time you build it.
//
// SpoutDX rather than the OpenGL SpoutLibrary on purpose: soupsend is a
// console program with no GL context and no window, and SpoutDX is the
// variant meant for exactly that — it opens its own D3D11 device.
//
// Build on Windows, roughly:
//   cl /std:c++17 /EHsc /DHAVE_SPOUT send.c sha1.c sink_test.c sink_spout.cpp ^
//      /I path\to\Spout2\SPOUTSDK\SpoutDirectX\SpoutDX ^
//      SpoutDX.lib d3d11.lib dxgi.lib ws2_32.lib
#ifdef HAVE_SPOUT

extern "C" {
#include "sink.h"
}
#include "SpoutDX.h"
#include <cstdio>
#include <cstdlib>
#include <cstring>

struct Spt {
    spoutDX sender;
    char    name[256];
    bool    open;
};

static int s_open(Sink *s, int w, int h, int fps) {
    Spt *p = static_cast<Spt *>(s->priv);
    if (!p->open) {
        if (!p->sender.OpenDirectX11()) {
            std::fprintf(stderr, "soupsend[spout]: OpenDirectX11 failed\n");
            return 1;
        }
        p->sender.SetSenderName(p->name);
        p->open = true;
    }
    s->w = w; s->h = h; s->fps = fps;
    std::fprintf(stderr, "soupsend[spout]: sending \"%s\" at %dx%d\n", p->name, w, h);
    return 0;
}

static int s_frame(Sink *s, const uint8_t *rgba, int w, int h, uint64_t pts_ms) {
    (void)pts_ms;                       // Spout has no timecode: it is a texture, not a stream
    Spt *p = static_cast<Spt *>(s->priv);
    if (!p->open) return 1;
    // SendImage takes RGBA exactly as it arrives here, so there is no
    // conversion and no flip — the page already sends top-left origin.
    p->sender.SendImage(rgba, static_cast<unsigned int>(w), static_cast<unsigned int>(h));
    return 0;
}

static void s_close(Sink *s) {
    Spt *p = static_cast<Spt *>(s->priv);
    if (p->open) { p->sender.ReleaseSender(); p->sender.CloseDirectX11(); p->open = false; }
    s->w = s->h = 0;
}

extern "C" Sink *sink_spout_new(const char *opt, const char **why) {
    Sink *s = static_cast<Sink *>(std::calloc(1, sizeof(Sink)));
    Spt  *p = new (std::nothrow) Spt();
    if (!s || !p) { std::free(s); delete p; *why = "out of memory"; return NULL; }
    std::snprintf(p->name, sizeof p->name, "%s", (opt && *opt) ? opt : "LucidSoup Playground");
    p->open = false;
    s->name = "spout"; s->priv = p;
    s->open = s_open; s->frame = s_frame; s->close = s_close;
    return s;
}

#endif /* HAVE_SPOUT */
