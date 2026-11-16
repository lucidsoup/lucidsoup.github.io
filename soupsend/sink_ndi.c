// NDI out.
//
// NOT COMPILED OR RUN WHERE THIS WAS WRITTEN. The NDI SDK is a licensed
// download from Vizrt rather than a package, so it could not be fetched, and
// this file has never been through a compiler. Treat it as a careful first
// draft: the shape is right and the field names come from the SDK's own
// header, but expect to fix something the first time you build it, and please
// send back what.
//
// Build:  make ndi NDI_SDK=/path/to/NDI\ SDK
//
// The one piece of luck here: NDI takes RGBA directly as a FourCC, so the
// frames arrive in a layout it already understands and nothing is converted.
#ifdef HAVE_NDI

#include "sink.h"
#include <Processing.NDI.Lib.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
    NDIlib_send_instance_t send;
    char                   name[128];
} Ndi;

static int n_open(Sink *s, int w, int h, int fps) {
    Ndi *n = s->priv;
    if (n->send) { NDIlib_send_destroy(n->send); n->send = NULL; }

    NDIlib_send_create_t desc;
    memset(&desc, 0, sizeof desc);
    desc.p_ndi_name = n->name;
    // Let NDI pace the output. Without this a receiver gets frames as fast as
    // the browser happens to produce them, which is not a frame rate.
    desc.clock_video = true;
    desc.clock_audio = false;

    n->send = NDIlib_send_create(&desc);
    if (!n->send) { fprintf(stderr, "soupsend[ndi]: NDIlib_send_create failed\n"); return 1; }
    s->w = w; s->h = h; s->fps = fps;
    fprintf(stderr, "soupsend[ndi]: sending \"%s\" at %dx%d\n", n->name, w, h);
    return 0;
}

static int n_frame(Sink *s, const uint8_t *rgba, int w, int h, uint64_t pts_ms) {
    Ndi *n = s->priv;
    if (!n->send) return 1;

    NDIlib_video_frame_v2_t f;
    memset(&f, 0, sizeof f);
    f.xres = w;
    f.yres = h;
    f.FourCC = NDIlib_FourCC_type_RGBA;
    f.frame_rate_N = s->fps * 1000;
    f.frame_rate_D = 1000;
    f.picture_aspect_ratio = (float)w / (float)h;
    f.frame_format_type = NDIlib_frame_format_type_progressive;
    f.p_data = (uint8_t *)rgba;
    f.line_stride_in_bytes = w * 4;
    // NDI timestamps are 100ns units. The page sends milliseconds from its own
    // clock, which is monotonic but has no relationship to anyone else's, so
    // this is for ordering and pacing only.
    f.timecode = (int64_t)pts_ms * 10000;

    // The synchronous call, not send_video_async: async keeps a pointer to
    // this buffer and the buffer is reused for the next frame, so async would
    // be publishing whatever arrived next.
    NDIlib_send_send_video_v2(n->send, &f);
    return 0;
}

static void n_close(Sink *s) {
    Ndi *n = s->priv;
    if (n->send) { NDIlib_send_destroy(n->send); n->send = NULL; }
    s->w = s->h = 0;
}

Sink *sink_ndi_new(const char *opt, const char **why) {
    if (!NDIlib_initialize()) {
        *why = "NDIlib_initialize() failed — on most machines that means the NDI "
               "runtime is not installed, which is a separate thing from the SDK.";
        return NULL;
    }
    Sink *s = calloc(1, sizeof *s);
    Ndi  *n = calloc(1, sizeof *n);
    if (!s || !n) { free(s); free(n); *why = "out of memory"; return NULL; }
    snprintf(n->name, sizeof n->name, "%s", (opt && *opt) ? opt : "LucidSoup Playground");
    s->name = "ndi"; s->priv = n;
    s->open = n_open; s->frame = n_frame; s->close = n_close;
    return s;
}

#endif /* HAVE_NDI */
