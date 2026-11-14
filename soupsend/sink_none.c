// The sinks that are not in this build.
//
// Rather than #ifdef the call sites, the ones that were not compiled in say
// so when asked for, with the reason — so `--sink ndi` on a build without the
// SDK explains itself instead of failing somewhere less obvious.
#include "sink.h"
#include <stddef.h>

#ifndef HAVE_NDI
Sink *sink_ndi_new(const char *opt, const char **why) {
    (void)opt;
    *why = "this build has no NDI. The SDK is a licensed download from Vizrt rather "
           "than a package, so it cannot be bundled: get it from "
           "https://ndi.video/for-developers/ndi-sdk/ and run `make ndi NDI_SDK=...`.";
    return NULL;
}
#endif

#ifndef HAVE_SPOUT
Sink *sink_spout_new(const char *opt, const char **why) {
    (void)opt;
    *why = "Spout is Windows only — it is a DirectX shared texture, so there is "
           "nothing for it to share on this operating system. Use --sink ndi here, "
           "or build soupsend on Windows (see README.md).";
    return NULL;
}
#endif
