// pluginhost — your own CLAP plugins, played in a browser.
//
// A browser cannot load a .clap, a .vst3 or an .component. Those are native
// shared libraries, and nothing in any browser will dlopen one; it is not a gap
// to code around. So this does the dlopen, and the browser does the listening.
//
// It is also the web server. That is the whole trick, and it is not laziness:
//
//   - Safari refuses an http://127.0.0.1 subresource inside an https:// page as
//     mixed content. WebKit deviates from the spec here deliberately, so a page
//     on a public site cannot reach a local helper at all on Safari.
//   - Chrome 142 began gating public-site -> 127.0.0.1 behind a Local Network
//     Access permission prompt, which replaced Private Network Access.
//
// Serve the page from the same place that answers the audio calls and both
// problems are simply absent: one origin, no mixed content, no prompt, no CORS.
// The page you get at http://127.0.0.1:7777 is the same file in this folder.
//
// Build: make        (fetches the MIT CLAP headers, then one cc invocation)
// Run:   ./pluginhost

#define _GNU_SOURCE
#include <dirent.h>
#include <dlfcn.h>
#include <errno.h>
#include <math.h>
#include <stdarg.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <strings.h>
#include <unistd.h>

#include <arpa/inet.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <sys/socket.h>
#include <sys/stat.h>

#include <clap/clap.h>

// Rendering happens in blocks like any host, so a plugin sees the buffer sizes
// it expects rather than one enormous one it may refuse to allocate for.
#define BLOCK 512
// Silence fed in before the real audio, so a plugin's parameter smoothing and
// its filters settle on the values we just set instead of gliding to them
// audibly over the first few milliseconds. Discarded afterwards.
#define PREROLL 4096
#define MAX_BODY (384u * 1024u * 1024u)
#define MAX_FRAMES (48000u * 60u * 12u)

static int verbose = 0;

static void say(const char *fmt, ...) {
   va_list ap;
   va_start(ap, fmt);
   vfprintf(stderr, fmt, ap);
   va_end(ap);
   fputc('\n', stderr);
}

static void *xmalloc(size_t n) {
   void *p = malloc(n ? n : 1);
   if (!p) {
      say("out of memory");
      exit(1);
   }
   return p;
}
static char *xstrdup(const char *s) {
   if (!s) s = "";
   size_t n = strlen(s) + 1;
   char *p = xmalloc(n);
   memcpy(p, s, n);
   return p;
}

// ---------------------------------------------------------------- growable text

typedef struct {
   char  *s;
   size_t len, cap;
} Buf;

static void buf_need(Buf *b, size_t extra) {
   if (b->len + extra + 1 <= b->cap) return;
   size_t cap = b->cap ? b->cap : 256;
   while (cap < b->len + extra + 1) cap *= 2;
   b->s = realloc(b->s, cap);
   if (!b->s) {
      say("out of memory");
      exit(1);
   }
   b->cap = cap;
}
static void buf_add(Buf *b, const char *s, size_t n) {
   buf_need(b, n);
   memcpy(b->s + b->len, s, n);
   b->len += n;
   b->s[b->len] = 0;
}
static void buf_str(Buf *b, const char *s) { buf_add(b, s, strlen(s)); }
static void buf_fmt(Buf *b, const char *fmt, ...) {
   char    tmp[1024];
   va_list ap;
   va_start(ap, fmt);
   int n = vsnprintf(tmp, sizeof tmp, fmt, ap);
   va_end(ap);
   if (n > 0) buf_add(b, tmp, (size_t)n < sizeof tmp ? (size_t)n : sizeof tmp - 1);
}
// A JSON string. Control characters have to go somewhere, and \u00xx is the only
// escape that is always legal, so everything below a space takes that route.
static void buf_json(Buf *b, const char *s) {
   buf_str(b, "\"");
   for (const unsigned char *p = (const unsigned char *)(s ? s : ""); *p; p++) {
      switch (*p) {
      case '"': buf_str(b, "\\\""); break;
      case '\\': buf_str(b, "\\\\"); break;
      case '\n': buf_str(b, "\\n"); break;
      case '\r': buf_str(b, "\\r"); break;
      case '\t': buf_str(b, "\\t"); break;
      default:
         if (*p < 0x20)
            buf_fmt(b, "\\u%04x", *p);
         else
            buf_add(b, (const char *)p, 1);
      }
   }
   buf_str(b, "\"");
}

// ------------------------------------------------------------------ the host

static bool  host_is_audio = false;
static Buf   plugin_log = {0};

static void CLAP_ABI h_log(const clap_host_t *h, clap_log_severity sev, const char *msg) {
   (void)h;
   static const char *names[] = {"debug", "info", "warning", "error", "fatal",
                                 "host-misbehaving", "plugin-misbehaving"};
   const char *n = (sev >= 0 && sev <= 6) ? names[sev] : "?";
   if (verbose || sev >= CLAP_LOG_WARNING) say("  plugin [%s] %s", n, msg ? msg : "");
   // Kept for the page, so a plugin that explains its own refusal is not silent.
   if (sev >= CLAP_LOG_WARNING && plugin_log.len < 4000) {
      if (plugin_log.len) buf_str(&plugin_log, "\n");
      buf_fmt(&plugin_log, "[%s] %s", n, msg ? msg : "");
   }
}
static bool CLAP_ABI h_is_main(const clap_host_t *h) {
   (void)h;
   return !host_is_audio;
}
static bool CLAP_ABI h_is_audio(const clap_host_t *h) {
   (void)h;
   return host_is_audio;
}
static void CLAP_ABI h_params_rescan(const clap_host_t *h, clap_param_rescan_flags f) {
   (void)h;
   (void)f;
}
static void CLAP_ABI h_params_clear(const clap_host_t *h, clap_id id, clap_param_clear_flags f) {
   (void)h;
   (void)id;
   (void)f;
}
static void CLAP_ABI h_params_flush(const clap_host_t *h) { (void)h; }
static void CLAP_ABI h_latency_changed(const clap_host_t *h) { (void)h; }
static void CLAP_ABI h_state_dirty(const clap_host_t *h) { (void)h; }
static void CLAP_ABI h_request_restart(const clap_host_t *h) { (void)h; }
static void CLAP_ABI h_request_process(const clap_host_t *h) { (void)h; }
static void CLAP_ABI h_request_callback(const clap_host_t *h) { (void)h; }

static const clap_host_log_t          ext_log = {h_log};
static const clap_host_thread_check_t ext_thread = {h_is_main, h_is_audio};
static const clap_host_params_t       ext_params = {h_params_rescan, h_params_clear,
                                                    h_params_flush};
static const clap_host_latency_t      ext_latency = {h_latency_changed};
static const clap_host_state_t        ext_state = {h_state_dirty};

// Anything we do not implement must come back NULL rather than a stub that lies,
// because a plugin is entitled to behave differently when an extension is absent.
static const void *CLAP_ABI h_get_ext(const clap_host_t *h, const char *id) {
   (void)h;
   if (!strcmp(id, CLAP_EXT_LOG)) return &ext_log;
   if (!strcmp(id, CLAP_EXT_THREAD_CHECK)) return &ext_thread;
   if (!strcmp(id, CLAP_EXT_PARAMS)) return &ext_params;
   if (!strcmp(id, CLAP_EXT_LATENCY)) return &ext_latency;
   if (!strcmp(id, CLAP_EXT_STATE)) return &ext_state;
   return NULL;
}

static const clap_host_t the_host = {
   .clap_version = CLAP_VERSION_INIT,
   .host_data = NULL,
   .name = "pluginhost",
   .vendor = "lucidsoup",
   .url = "https://www.lucidsoup.com",
   .version = "1",
   .get_extension = h_get_ext,
   .request_restart = h_request_restart,
   .request_process = h_request_process,
   .request_callback = h_request_callback,
};

// ------------------------------------------------------------------- scanning

typedef struct {
   char *bundle;  // what the user calls it: /…/Thing.clap
   char *dso;     // what dlopen wants, which on macOS is inside the bundle
   char *id, *name, *vendor, *version, *descr, *features;
} Found;

static Found *found = NULL;
static int    nfound = 0, cfound = 0;

static void found_push(Found f) {
   if (nfound == cfound) {
      cfound = cfound ? cfound * 2 : 16;
      found = realloc(found, (size_t)cfound * sizeof *found);
      if (!found) exit(1);
   }
   found[nfound++] = f;
}

static bool is_dir(const char *p) {
   struct stat st;
   return stat(p, &st) == 0 && S_ISDIR(st.st_mode);
}
static bool is_file(const char *p) {
   struct stat st;
   return stat(p, &st) == 0 && S_ISREG(st.st_mode);
}
static bool ends_with(const char *s, const char *suf) {
   size_t a = strlen(s), b = strlen(suf);
   return a >= b && !strcmp(s + a - b, suf);
}

// On Linux and Windows a .clap is the shared library. On macOS it is a bundle
// directory, and the library lives at Contents/MacOS/<something>; the name in
// there is not required to match the bundle, so take whatever file is present.
static char *resolve_dso(const char *bundle) {
   if (is_file(bundle)) return xstrdup(bundle);
   if (!is_dir(bundle)) return NULL;
   char macos[3072];
   if (snprintf(macos, sizeof macos, "%s/Contents/MacOS", bundle) >= (int)sizeof macos)
      return NULL;
   DIR *d = opendir(macos);
   if (!d) return NULL;
   char          *out = NULL;
   struct dirent *e;
   while ((e = readdir(d))) {
      if (e->d_name[0] == '.') continue;
      char p[4096];
      if (snprintf(p, sizeof p, "%s/%s", macos, e->d_name) >= (int)sizeof p) continue;
      if (is_file(p)) {
         out = xstrdup(p);
         break;
      }
   }
   closedir(d);
   return out;
}

// Open a .clap, copy out what its factory says, and close it again. The
// descriptors belong to the plugin and die with deinit(), so every string that
// outlives this call is duplicated here.
static void scan_one(const char *bundle) {
   char *dso = resolve_dso(bundle);
   if (!dso) return;
   if (verbose) say("  opening %s", dso);

   void *lib = dlopen(dso, RTLD_LOCAL | RTLD_NOW);
   if (!lib) {
      say("  skipped %s: %s", bundle, dlerror());
      free(dso);
      return;
   }
   const clap_plugin_entry_t *entry = dlsym(lib, "clap_entry");
   if (!entry || !entry->init || !entry->get_factory) {
      say("  skipped %s: no clap_entry", bundle);
      dlclose(lib);
      free(dso);
      return;
   }
   if (!entry->init(bundle)) {
      say("  skipped %s: entry init() refused", bundle);
      dlclose(lib);
      free(dso);
      return;
   }
   const clap_plugin_factory_t *fac = entry->get_factory(CLAP_PLUGIN_FACTORY_ID);
   if (fac && fac->get_plugin_count) {
      uint32_t n = fac->get_plugin_count(fac);
      for (uint32_t i = 0; i < n; i++) {
         const clap_plugin_descriptor_t *d = fac->get_plugin_descriptor(fac, i);
         if (!d || !d->id) continue;
         Buf feat = {0};
         if (d->features)
            for (const char *const *f = d->features; *f; f++) {
               if (feat.len) buf_str(&feat, ",");
               buf_str(&feat, *f);
            }
         Found got = {.bundle = xstrdup(bundle),
                      .dso = xstrdup(dso),
                      .id = xstrdup(d->id),
                      .name = xstrdup(d->name ? d->name : d->id),
                      .vendor = xstrdup(d->vendor ? d->vendor : ""),
                      .version = xstrdup(d->version ? d->version : ""),
                      .descr = xstrdup(d->description ? d->description : ""),
                      .features = xstrdup(feat.s ? feat.s : "")};
         free(feat.s);
         found_push(got);
      }
   }
   if (entry->deinit) entry->deinit();
   dlclose(lib);
   free(dso);
}

static void scan_dir(const char *dir, int depth) {
   if (depth > 6) return;
   DIR *d = opendir(dir);
   if (!d) return;
   struct dirent *e;
   while ((e = readdir(d))) {
      if (!strcmp(e->d_name, ".") || !strcmp(e->d_name, "..")) continue;
      char p[4096];
      // A path too long to hold is a path we decline to guess at.
      if (snprintf(p, sizeof p, "%s/%s", dir, e->d_name) >= (int)sizeof p) continue;
      if (ends_with(e->d_name, ".clap"))
         scan_one(p);
      else if (is_dir(p))
         scan_dir(p, depth + 1);
   }
   closedir(d);
}

// The directories the CLAP specification tells hosts to look in, plus anything
// named in CLAP_PATH, which is how a plugin kept somewhere else gets found.
static void scan_all(char **extra, int nextra) {
   const char *home = getenv("HOME");
   char        buf[4096];
   const char *fixed[] = {
#if defined(__APPLE__)
      "/Library/Audio/Plug-Ins/CLAP",
#else
      "/usr/lib/clap", "/usr/local/lib/clap",
#endif
      NULL};
   for (int i = 0; fixed[i]; i++)
      if (is_dir(fixed[i])) scan_dir(fixed[i], 0);
   if (home) {
#if defined(__APPLE__)
      snprintf(buf, sizeof buf, "%s/Library/Audio/Plug-Ins/CLAP", home);
#else
      snprintf(buf, sizeof buf, "%s/.clap", home);
#endif
      if (is_dir(buf)) scan_dir(buf, 0);
   }
   const char *cp = getenv("CLAP_PATH");
   if (cp && *cp) {
      char *copy = xstrdup(cp), *save = NULL;
      for (char *t = strtok_r(copy, ":", &save); t; t = strtok_r(NULL, ":", &save))
         if (is_dir(t)) scan_dir(t, 0);
      free(copy);
   }
   for (int i = 0; i < nextra; i++) {
      if (ends_with(extra[i], ".clap"))
         scan_one(extra[i]);
      else if (is_dir(extra[i]))
         scan_dir(extra[i], 0);
      else
         say("  not a directory or .clap: %s", extra[i]);
   }
}

// ------------------------------------------------------- one plugin, kept open

// Loading a plugin can cost hundreds of milliseconds when it has samples to
// read, and turning a knob re-renders. So the last one stays open and activated,
// and is only torn down when the page asks for a different plugin or a different
// sample rate. reset() between renders is what stops one render's reverb tail
// from appearing at the start of the next.
typedef struct {
   char                      *dso, *id;
   void                      *lib;
   const clap_plugin_entry_t *entry;
   const clap_plugin_t       *plug;
   const clap_plugin_params_t      *params;
   const clap_plugin_audio_ports_t *ports;
   const clap_plugin_latency_t     *latency;
   double   rate;
   uint32_t in_ch, out_ch;
   bool     active, processing;
} Open;

static Open open_plug = {0};

static void unload(void) {
   if (open_plug.plug) {
      if (open_plug.processing && open_plug.plug->stop_processing)
         open_plug.plug->stop_processing(open_plug.plug);
      if (open_plug.active && open_plug.plug->deactivate)
         open_plug.plug->deactivate(open_plug.plug);
      if (open_plug.plug->destroy) open_plug.plug->destroy(open_plug.plug);
   }
   if (open_plug.entry && open_plug.entry->deinit) open_plug.entry->deinit();
   if (open_plug.lib) dlclose(open_plug.lib);
   free(open_plug.dso);
   free(open_plug.id);
   memset(&open_plug, 0, sizeof open_plug);
}

static Found *find_by_id(const char *id) {
   for (int i = 0; i < nfound; i++)
      if (!strcmp(found[i].id, id)) return &found[i];
   return NULL;
}

static uint32_t port_channels(const clap_plugin_t *p, const clap_plugin_audio_ports_t *ap,
                              bool input, uint32_t fallback) {
   if (!ap || !ap->count) return fallback;
   if (ap->count(p, input) == 0) return 0;
   clap_audio_port_info_t info;
   memset(&info, 0, sizeof info);
   if (!ap->get(p, 0, input, &info)) return fallback;
   return info.channel_count;
}

// Returns NULL on success, or a sentence for the page to show.
static const char *load(const char *id, double rate) {
   if (open_plug.plug && !strcmp(open_plug.id, id) && open_plug.rate == rate) return NULL;
   unload();

   Found *f = find_by_id(id);
   if (!f) return "No plugin with that id was found in the scan.";

   void *lib = dlopen(f->dso, RTLD_LOCAL | RTLD_NOW);
   if (!lib) return "The plugin file would not open.";
   const clap_plugin_entry_t *entry = dlsym(lib, "clap_entry");
   if (!entry || !entry->init(f->bundle)) {
      dlclose(lib);
      return "The plugin refused to initialise.";
   }
   const clap_plugin_factory_t *fac = entry->get_factory(CLAP_PLUGIN_FACTORY_ID);
   if (!fac || !fac->create_plugin) {
      if (entry->deinit) entry->deinit();
      dlclose(lib);
      return "The plugin has no CLAP factory.";
   }
   const clap_plugin_t *p = fac->create_plugin(fac, &the_host, id);
   if (!p) {
      if (entry->deinit) entry->deinit();
      dlclose(lib);
      return "The plugin would not instantiate.";
   }
   open_plug.lib = lib;
   open_plug.entry = entry;
   open_plug.plug = p;
   open_plug.dso = xstrdup(f->dso);
   open_plug.id = xstrdup(id);

   if (p->init && !p->init(p)) {
      unload();
      return "The plugin's init() failed.";
   }
   open_plug.params = p->get_extension ? p->get_extension(p, CLAP_EXT_PARAMS) : NULL;
   open_plug.ports = p->get_extension ? p->get_extension(p, CLAP_EXT_AUDIO_PORTS) : NULL;
   open_plug.latency = p->get_extension ? p->get_extension(p, CLAP_EXT_LATENCY) : NULL;
   open_plug.in_ch = port_channels(p, open_plug.ports, true, 2);
   open_plug.out_ch = port_channels(p, open_plug.ports, false, 2);
   if (open_plug.out_ch == 0) {
      unload();
      return "The plugin has no audio output port, so there is nothing to hear.";
   }
   if (!p->activate || !p->activate(p, rate, 1, BLOCK)) {
      unload();
      return "The plugin would not activate at this sample rate.";
   }
   open_plug.active = true;
   open_plug.rate = rate;
   if (p->start_processing && !p->start_processing(p)) {
      unload();
      return "The plugin would not start processing.";
   }
   open_plug.processing = true;
   return NULL;
}

// ------------------------------------------------------------- the event list

typedef union {
   clap_event_header_t      hdr;
   clap_event_param_value_t pv;
   clap_event_note_t        note;
} AnyEvent;

typedef struct {
   AnyEvent             *all;    // absolute times, sorted
   uint32_t              count;
   AnyEvent             *scratch;  // this block's copy, times rebased
   clap_event_header_t **ptrs;
   uint32_t              nblk;
} Events;

static uint32_t CLAP_ABI ev_size(const clap_input_events_t *list) {
   return ((Events *)list->ctx)->nblk;
}
static const clap_event_header_t *CLAP_ABI ev_get(const clap_input_events_t *list, uint32_t i) {
   Events *e = (Events *)list->ctx;
   return i < e->nblk ? e->ptrs[i] : NULL;
}
static bool CLAP_ABI ev_push(const clap_output_events_t *list, const clap_event_header_t *ev) {
   (void)list;
   (void)ev;
   return true;  // a plugin's own output events are not used here
}

// ------------------------------------------------------------------ rendering

typedef struct {
   uint32_t id;
   double   value;
} ParamSet;

typedef struct {
   uint32_t start, length;
   int16_t  key, channel;
   double   velocity;
} NoteHit;

typedef struct {
   const char *id;
   uint32_t    rate, channels, frames;
   ParamSet   *params;
   uint32_t    nparams;
   NoteHit    *notes;
   uint32_t    nnotes;
   const float *in;  // planar: channels * frames, may be NULL for an instrument
} Req;

typedef struct {
   float   *data;  // planar: channels * frames
   uint32_t channels, frames;
   int      status;
} Res;

static const char *render(const Req *rq, Res *out) {
   plugin_log.len = 0;
   if (plugin_log.s) plugin_log.s[0] = 0;

   const char *err = load(rq->id, (double)rq->rate);
   if (err) return err;
   const clap_plugin_t *p = open_plug.plug;

   if (p->reset) p->reset(p);

   uint32_t in_ch = open_plug.in_ch, out_ch = open_plug.out_ch;
   // A plugin with lookahead reports it, and the output arrives that many frames
   // late. Render the extra frames and drop them, so what comes back lines up
   // with what went in instead of being quietly shifted.
   uint32_t lat = open_plug.latency && open_plug.latency->get ? open_plug.latency->get(p) : 0;
   if (lat > rq->rate * 10u) lat = 0;  // a nonsense figure is worse than none
   // Two different offsets, and conflating them shifts the whole render by the
   // plugin's latency: the caller's audio goes IN after the preroll, but comes
   // OUT the plugin's latency later than that.
   uint32_t in_off = PREROLL;
   uint32_t out_off = PREROLL + lat;
   uint32_t total = out_off + rq->frames;

   // --- buffers the plugin sees, always in its own channel layout
   float **inbuf = NULL;
   if (in_ch) {
      inbuf = xmalloc(in_ch * sizeof *inbuf);
      for (uint32_t c = 0; c < in_ch; c++) inbuf[c] = xmalloc(BLOCK * sizeof(float));
   }
   float **outbuf = xmalloc(out_ch * sizeof *outbuf);
   for (uint32_t c = 0; c < out_ch; c++) outbuf[c] = xmalloc(BLOCK * sizeof(float));

   out->channels = out_ch;
   out->frames = rq->frames;
   out->data = xmalloc((size_t)out_ch * rq->frames * sizeof(float) + 4);

   // --- events, with the preroll offset applied so note 0 is real-audio frame 0
   Events ev = {0};
   ev.count = rq->nparams + rq->nnotes * 2;
   ev.all = xmalloc((ev.count ? ev.count : 1) * sizeof *ev.all);
   ev.scratch = xmalloc((ev.count ? ev.count : 1) * sizeof *ev.scratch);
   ev.ptrs = xmalloc((ev.count ? ev.count : 1) * sizeof *ev.ptrs);
   uint32_t n = 0;
   for (uint32_t i = 0; i < rq->nparams; i++) {
      clap_event_param_value_t *e = &ev.all[n++].pv;
      memset(e, 0, sizeof *e);
      e->header.size = sizeof *e;
      e->header.time = 0;  // before any audio, so smoothing settles in the preroll
      e->header.space_id = CLAP_CORE_EVENT_SPACE_ID;
      e->header.type = CLAP_EVENT_PARAM_VALUE;
      e->param_id = rq->params[i].id;
      e->note_id = -1;
      e->port_index = -1;
      e->channel = -1;
      e->key = -1;
      e->value = rq->params[i].value;
   }
   for (uint32_t i = 0; i < rq->nnotes; i++) {
      const NoteHit *h = &rq->notes[i];
      clap_event_note_t *on = &ev.all[n++].note;
      memset(on, 0, sizeof *on);
      on->header.size = sizeof *on;
      on->header.time = in_off + h->start;
      on->header.space_id = CLAP_CORE_EVENT_SPACE_ID;
      on->header.type = CLAP_EVENT_NOTE_ON;
      on->note_id = (int32_t)i;
      on->port_index = 0;
      on->channel = h->channel;
      on->key = h->key;
      on->velocity = h->velocity;
      clap_event_note_t *off = &ev.all[n++].note;
      *off = *on;
      off->header.time = in_off + h->start + h->length;
      off->header.type = CLAP_EVENT_NOTE_OFF;
      off->velocity = 0;
   }
   ev.count = n;
   // Insertion sort by time: CLAP requires the list in order, and n is tiny.
   for (uint32_t i = 1; i < n; i++) {
      AnyEvent k = ev.all[i];
      uint32_t j = i;
      while (j > 0 && ev.all[j - 1].hdr.time > k.hdr.time) {
         ev.all[j] = ev.all[j - 1];
         j--;
      }
      ev.all[j] = k;
   }

   clap_input_events_t  in_events = {.ctx = &ev, .size = ev_size, .get = ev_get};
   clap_output_events_t out_events = {.ctx = NULL, .try_push = ev_push};

   clap_audio_buffer_t ab_in = {0}, ab_out = {0};
   ab_in.data32 = inbuf;
   ab_in.channel_count = in_ch;
   ab_out.data32 = outbuf;
   ab_out.channel_count = out_ch;

   clap_process_t pr = {0};
   pr.audio_inputs = in_ch ? &ab_in : NULL;
   pr.audio_inputs_count = in_ch ? 1 : 0;
   pr.audio_outputs = &ab_out;
   pr.audio_outputs_count = 1;
   pr.in_events = &in_events;
   pr.out_events = &out_events;

   int      status = CLAP_PROCESS_CONTINUE;
   uint32_t cursor = 0;  // event cursor into the sorted list
   host_is_audio = true;
   for (uint32_t pos = 0; pos < total; pos += BLOCK) {
      uint32_t len = total - pos < BLOCK ? total - pos : BLOCK;

      // Input: silence through the preroll, then the page's audio, duplicated or
      // dropped as needed to match however many channels the plugin asked for.
      for (uint32_t c = 0; c < in_ch; c++) {
         float *dst = inbuf[c];
         for (uint32_t i = 0; i < len; i++) {
            int64_t src = (int64_t)pos + i - (int64_t)in_off;
            if (!rq->in || src < 0 || src >= rq->frames) {
               dst[i] = 0.f;
            } else {
               uint32_t sc = rq->channels ? c % rq->channels : 0;
               dst[i] = rq->in[(size_t)sc * rq->frames + (size_t)src];
            }
         }
      }
      for (uint32_t c = 0; c < out_ch; c++) memset(outbuf[c], 0, len * sizeof(float));

      // This block's events, times made relative to the block as CLAP requires.
      ev.nblk = 0;
      while (cursor < ev.count && ev.all[cursor].hdr.time < pos + len) {
         AnyEvent *s = &ev.all[cursor];
         AnyEvent *d = &ev.scratch[ev.nblk];
         *d = *s;
         d->hdr.time = s->hdr.time > pos ? s->hdr.time - pos : 0;
         ev.ptrs[ev.nblk] = &d->hdr;
         ev.nblk++;
         cursor++;
      }

      pr.frames_count = len;
      pr.steady_time = (int64_t)pos;
      ab_in.constant_mask = 0;
      ab_out.constant_mask = 0;

      int st = p->process ? p->process(p, &pr) : CLAP_PROCESS_ERROR;
      if (st == CLAP_PROCESS_ERROR) {
         status = CLAP_PROCESS_ERROR;
         break;
      }
      status = st;

      // Keep only what lines up with the caller's audio.
      for (uint32_t i = 0; i < len; i++) {
         int64_t dst = (int64_t)pos + i - (int64_t)out_off;
         if (dst < 0 || dst >= rq->frames) continue;
         for (uint32_t c = 0; c < out_ch; c++)
            out->data[(size_t)c * rq->frames + (size_t)dst] = outbuf[c][i];
      }
   }
   host_is_audio = false;
   out->status = status;

   for (uint32_t c = 0; c < in_ch; c++) free(inbuf[c]);
   free(inbuf);
   for (uint32_t c = 0; c < out_ch; c++) free(outbuf[c]);
   free(outbuf);
   free(ev.all);
   free(ev.scratch);
   free(ev.ptrs);

   if (status == CLAP_PROCESS_ERROR) {
      free(out->data);
      out->data = NULL;
      return plugin_log.len ? plugin_log.s : "The plugin reported an error while processing.";
   }
   return NULL;
}

// ----------------------------------------------------------------- HTTP plumbing

// 24 random bytes as hex is 48 characters; the room above that is for a token
// passed in by hand, which is checked rather than quietly cut short.
static char token[129];

static void gen_token(void) {
   unsigned char raw[24];
   FILE         *f = fopen("/dev/urandom", "rb");
   if (!f || fread(raw, 1, sizeof raw, f) != sizeof raw) {
      say("cannot read /dev/urandom");
      exit(1);
   }
   fclose(f);
   for (int i = 0; i < 24; i++) snprintf(token + i * 2, 3, "%02x", raw[i]);
   token[48] = 0;
}

static bool send_all(int fd, const void *p, size_t n) {
   const char *b = p;
   while (n) {
      ssize_t w = send(fd, b, n, 0);
      if (w <= 0) return false;
      b += w;
      n -= (size_t)w;
   }
   return true;
}

static void respond(int fd, int code, const char *status, const char *ctype, const void *body,
                    size_t len) {
   char h[512];
   int  hn = snprintf(h, sizeof h,
                      "HTTP/1.1 %d %s\r\n"
                      "content-type: %s\r\n"
                      "content-length: %zu\r\n"
                      "cache-control: no-store\r\n"
                      "connection: close\r\n"
                      // This page talks to a program that loads native code. It has
                      // no business being framed by, or fetched from, anywhere else.
                      "x-content-type-options: nosniff\r\n"
                      "x-frame-options: DENY\r\n"
                      "\r\n",
                      code, status, ctype, len);
   if (send_all(fd, h, (size_t)hn) && len) send_all(fd, body, len);
}
static void respond_text(int fd, int code, const char *status, const char *msg) {
   Buf b = {0};
   buf_str(&b, "{\"error\":");
   buf_json(&b, msg);
   buf_str(&b, "}");
   respond(fd, code, status, "application/json; charset=utf-8", b.s, b.len);
   free(b.s);
}

static const char *hdr_get(const char *head, const char *name, char *out, size_t cap) {
   size_t nlen = strlen(name);
   for (const char *l = head; l && *l;) {
      const char *eol = strstr(l, "\r\n");
      if (!eol || eol == l) break;
      if ((size_t)(eol - l) > nlen && !strncasecmp(l, name, nlen) && l[nlen] == ':') {
         const char *v = l + nlen + 1;
         while (v < eol && (*v == ' ' || *v == '\t')) v++;
         size_t n = (size_t)(eol - v);
         if (n >= cap) n = cap - 1;
         memcpy(out, v, n);
         out[n] = 0;
         return out;
      }
      l = eol + 2;
   }
   return NULL;
}

// ------------------------------------------------------------------- the routes

static char *page_path = NULL;
static int   port = 7777;

static void route_plugins(int fd) {
   Buf b = {0};
   buf_fmt(&b, "{\"ok\":true,\"clap\":\"%d.%d.%d\",\"count\":%d,\"plugins\":[",
           CLAP_VERSION_MAJOR, CLAP_VERSION_MINOR, CLAP_VERSION_REVISION, nfound);
   for (int i = 0; i < nfound; i++) {
      if (i) buf_str(&b, ",");
      buf_str(&b, "{\"id\":");
      buf_json(&b, found[i].id);
      buf_str(&b, ",\"name\":");
      buf_json(&b, found[i].name);
      buf_str(&b, ",\"vendor\":");
      buf_json(&b, found[i].vendor);
      buf_str(&b, ",\"version\":");
      buf_json(&b, found[i].version);
      buf_str(&b, ",\"description\":");
      buf_json(&b, found[i].descr);
      buf_str(&b, ",\"features\":");
      buf_json(&b, found[i].features);
      buf_str(&b, ",\"path\":");
      buf_json(&b, found[i].bundle);
      buf_str(&b, "}");
   }
   buf_str(&b, "]}");
   respond(fd, 200, "OK", "application/json; charset=utf-8", b.s, b.len);
   free(b.s);
}

static void route_params(int fd, const char *id, int rate) {
   const char *err = load(id, rate > 0 ? rate : 48000);
   if (err) {
      respond_text(fd, 400, "Bad Request", err);
      return;
   }
   const clap_plugin_t       *p = open_plug.plug;
   const clap_plugin_params_t *pp = open_plug.params;
   Buf                        b = {0};
   buf_fmt(&b, "{\"ok\":true,\"inputChannels\":%u,\"outputChannels\":%u,\"latency\":%u,",
           open_plug.in_ch, open_plug.out_ch,
           open_plug.latency && open_plug.latency->get ? open_plug.latency->get(p) : 0);
   buf_str(&b, "\"params\":[");
   uint32_t n = pp && pp->count ? pp->count(p) : 0;
   int      written = 0;
   for (uint32_t i = 0; i < n; i++) {
      clap_param_info_t info;
      memset(&info, 0, sizeof info);
      if (!pp->get_info(p, i, &info)) continue;
      if (info.flags & CLAP_PARAM_IS_HIDDEN) continue;
      double value = info.default_value;
      if (pp->get_value) pp->get_value(p, info.id, &value);
      char text[CLAP_NAME_SIZE * 2];
      text[0] = 0;
      if (pp->value_to_text) pp->value_to_text(p, info.id, value, text, sizeof text);
      if (written++) buf_str(&b, ",");
      buf_fmt(&b, "{\"id\":%u,", (unsigned)info.id);
      buf_str(&b, "\"name\":");
      buf_json(&b, info.name);
      buf_str(&b, ",\"module\":");
      buf_json(&b, info.module);
      // Not finite is not representable in JSON, and a plugin is allowed to be
      // wrong about this; clamping keeps the page from getting a NaN literal.
      buf_fmt(&b, ",\"min\":%.17g,\"max\":%.17g,\"default\":%.17g,\"value\":%.17g",
              isfinite(info.min_value) ? info.min_value : 0.0,
              isfinite(info.max_value) ? info.max_value : 1.0,
              isfinite(info.default_value) ? info.default_value : 0.0,
              isfinite(value) ? value : 0.0);
      buf_fmt(&b, ",\"stepped\":%s", (info.flags & CLAP_PARAM_IS_STEPPED) ? "true" : "false");
      buf_fmt(&b, ",\"enum\":%s", (info.flags & CLAP_PARAM_IS_ENUM) ? "true" : "false");
      buf_fmt(&b, ",\"readonly\":%s", (info.flags & CLAP_PARAM_IS_READONLY) ? "true" : "false");
      buf_fmt(&b, ",\"bypass\":%s", (info.flags & CLAP_PARAM_IS_BYPASS) ? "true" : "false");
      buf_str(&b, ",\"text\":");
      buf_json(&b, text);
      buf_str(&b, "}");
   }
   buf_str(&b, "]}");
   respond(fd, 200, "OK", "application/json; charset=utf-8", b.s, b.len);
   free(b.s);
}

// The render request, laid out so there is no JSON parser in this program at
// all. Everything is little-endian, which every machine this runs on is.
//
//   u32 'LPH1'  u32 rate  u32 channels  u32 frames
//   u32 nparams u32 nnotes u32 idLen
//   idLen bytes of plugin id, then 0-3 zero bytes to the next multiple of 4
//   nparams * { u32 id, f64 value }
//   nnotes  * { u32 start, u32 length, i16 key, i16 channel, f64 velocity }
//   channels*frames f32, planar
//
// The padding is not decoration. Every record after it is 4 or 8 bytes wide and
// the audio is read as floats, so an id of 22 characters would otherwise leave
// the whole tail on an odd boundary: undefined behaviour here, and a hard throw
// in the browser, where a Float32Array refuses a byte offset it cannot align.
#define MAGIC 0x3148504Cu  // 'LPH1' little-endian

static uint32_t rd32(const unsigned char *p) {
   return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
}
static double rdf64(const unsigned char *p) {
   double d;
   memcpy(&d, p, 8);
   return d;
}
static int16_t rd16(const unsigned char *p) {
   uint16_t v = (uint16_t)((uint32_t)p[0] | ((uint32_t)p[1] << 8));
   return (int16_t)v;
}

static void route_render(int fd, const unsigned char *body, size_t len) {
   if (len < 28 || rd32(body) != MAGIC) {
      respond_text(fd, 400, "Bad Request", "That is not a render request.");
      return;
   }
   Req      rq = {0};
   uint32_t rate = rd32(body + 4), channels = rd32(body + 8), frames = rd32(body + 12);
   uint32_t nparams = rd32(body + 16), nnotes = rd32(body + 20), idlen = rd32(body + 24);
   size_t   at = 28;

   if (rate < 8000 || rate > 384000) {
      respond_text(fd, 400, "Bad Request", "That sample rate is out of range.");
      return;
   }
   if (frames > MAX_FRAMES) {
      respond_text(fd, 413, "Payload Too Large",
                   "That is more audio than this will render in one go. Select a shorter "
                   "region and render that.");
      return;
   }
   if (channels > 32 || nparams > 100000 || nnotes > 100000 || idlen > 1024) {
      respond_text(fd, 400, "Bad Request", "That render request is malformed.");
      return;
   }
   // Every length is checked against what actually arrived before anything is
   // read through it: these numbers come off a socket, not from a friend.
   size_t idpad = ((size_t)idlen + 3u) & ~(size_t)3u;
   size_t need = at + idpad + (size_t)nparams * 12 + (size_t)nnotes * 20 +
                 (size_t)channels * frames * 4;
   if (len < need) {
      respond_text(fd, 400, "Bad Request", "That render request is shorter than it claims.");
      return;
   }
   char *id = xmalloc(idlen + 1);
   memcpy(id, body + at, idlen);
   id[idlen] = 0;
   at += idpad;

   rq.id = id;
   rq.rate = rate;
   rq.channels = channels;
   rq.frames = frames;
   rq.nparams = nparams;
   rq.nnotes = nnotes;
   rq.params = nparams ? xmalloc(nparams * sizeof *rq.params) : NULL;
   rq.notes = nnotes ? xmalloc(nnotes * sizeof *rq.notes) : NULL;
   for (uint32_t i = 0; i < nparams; i++) {
      rq.params[i].id = rd32(body + at);
      rq.params[i].value = rdf64(body + at + 4);
      at += 12;
   }
   for (uint32_t i = 0; i < nnotes; i++) {
      rq.notes[i].start = rd32(body + at);
      rq.notes[i].length = rd32(body + at + 4);
      rq.notes[i].key = rd16(body + at + 8);
      rq.notes[i].channel = rd16(body + at + 10);
      rq.notes[i].velocity = rdf64(body + at + 12);
      if (rq.notes[i].start > frames) rq.notes[i].start = frames;
      if (rq.notes[i].length > frames) rq.notes[i].length = frames;
      at += 20;
   }
   rq.in = (channels && frames) ? (const float *)(body + at) : NULL;

   Res         res = {0};
   const char *err = render(&rq, &res);

   free(id);
   free(rq.params);
   free(rq.notes);

   if (err) {
      respond_text(fd, 400, "Bad Request", err);
      free(res.data);
      return;
   }
   //   u32 'LPH1'  u32 channels  u32 frames  u32 status  then f32 planar
   size_t         audio = (size_t)res.channels * res.frames * 4;
   unsigned char *out = xmalloc(16 + audio);
   uint32_t       head[4] = {MAGIC, res.channels, res.frames, (uint32_t)res.status};
   memcpy(out, head, 16);
   if (audio) memcpy(out + 16, res.data, audio);
   respond(fd, 200, "OK", "application/octet-stream", out, 16 + audio);
   free(out);
   free(res.data);
}

static void route_page(int fd) {
   FILE *f = page_path ? fopen(page_path, "rb") : NULL;
   if (!f) {
      const char *msg = "pluginhost is running, but page.html was not found next to it.";
      respond(fd, 500, "Internal Server Error", "text/plain; charset=utf-8", msg, strlen(msg));
      return;
   }
   Buf b = {0};
   char chunk[8192];
   size_t n;
   while ((n = fread(chunk, 1, sizeof chunk, f)) > 0) buf_add(&b, chunk, n);
   fclose(f);

   // The page is handed the token rather than asked to find it, which is what
   // keeps it out of the URL bar, out of the history and out of a referer.
   const char *mark = "__PLUGINHOST_TOKEN__";
   char       *at = strstr(b.s, mark);
   if (at) {
      Buf o = {0};
      buf_add(&o, b.s, (size_t)(at - b.s));
      buf_str(&o, token);
      buf_str(&o, at + strlen(mark));
      free(b.s);
      b = o;
   }
   respond(fd, 200, "OK", "text/html; charset=utf-8", b.s, b.len);
   free(b.s);
}

static void handle(int fd) {
   char   head[16384];
   size_t hlen = 0;
   char  *split = NULL;
   while (hlen < sizeof head - 1) {
      ssize_t n = recv(fd, head + hlen, sizeof head - 1 - hlen, 0);
      if (n <= 0) return;
      hlen += (size_t)n;
      head[hlen] = 0;
      if ((split = strstr(head, "\r\n\r\n"))) break;
   }
   if (!split) {
      respond_text(fd, 431, "Request Header Fields Too Large", "Those headers are too long.");
      return;
   }
   size_t head_len = (size_t)(split - head) + 4;

   char method[16] = {0}, target[2048] = {0};
   if (sscanf(head, "%15s %2047s", method, target) != 2) {
      respond_text(fd, 400, "Bad Request", "Unparseable request line.");
      return;
   }

   // A page somewhere else must not be able to drive a program that loads native
   // code. Same-origin requests send either no Origin or ours; anything else is
   // another site using this browser, and gets nothing. The token is the real
   // lock — this is the bolt that makes guessing it unnecessary to defend.
   char obuf[512];
   if (hdr_get(head, "origin", obuf, sizeof obuf)) {
      char a[128], b[128];
      snprintf(a, sizeof a, "http://127.0.0.1:%d", port);
      snprintf(b, sizeof b, "http://localhost:%d", port);
      if (strcmp(obuf, a) && strcmp(obuf, b)) {
         respond_text(fd, 403, "Forbidden", "This answers its own page only.");
         return;
      }
   }

   char *q = strchr(target, '?');
   char  path[1024];
   snprintf(path, sizeof path, "%.*s", q ? (int)(q - target) : (int)strlen(target), target);
   const char *query = q ? q + 1 : "";

   // The token travels in a header on the API calls, so it never reaches the URL
   // bar or a log. The page itself is the one thing served without it.
   char tbuf[128];
   bool authed = hdr_get(head, "x-pluginhost-token", tbuf, sizeof tbuf) && !strcmp(tbuf, token);

   if (!strcmp(path, "/") || !strcmp(path, "/index.html")) {
      route_page(fd);
      return;
   }
   if (strncmp(path, "/api/", 5)) {
      respond_text(fd, 404, "Not Found", "No such path.");
      return;
   }
   if (!authed) {
      respond_text(fd, 401, "Unauthorized",
                   "Wrong or missing token. Open the address pluginhost printed.");
      return;
   }

   if (!strcmp(path, "/api/health")) {
      Buf b = {0};
      buf_fmt(&b, "{\"ok\":true,\"name\":\"pluginhost\",\"clap\":\"%d.%d.%d\",\"plugins\":%d}",
              CLAP_VERSION_MAJOR, CLAP_VERSION_MINOR, CLAP_VERSION_REVISION, nfound);
      respond(fd, 200, "OK", "application/json; charset=utf-8", b.s, b.len);
      free(b.s);
      return;
   }
   if (!strcmp(path, "/api/plugins")) {
      route_plugins(fd);
      return;
   }
   if (!strcmp(path, "/api/params")) {
      char id[1024] = {0};
      int  rate = 48000;
      // id=<urlencoded>&rate=<n>
      const char *s = strstr(query, "id=");
      if (s) {
         s += 3;
         size_t k = 0;
         for (; *s && *s != '&' && k < sizeof id - 1; s++) {
            if (*s == '%' && isxdigit((unsigned char)s[1]) && isxdigit((unsigned char)s[2])) {
               char hex[3] = {s[1], s[2], 0};
               id[k++] = (char)strtol(hex, NULL, 16);
               s += 2;
            } else if (*s == '+') {
               id[k++] = ' ';
            } else {
               id[k++] = *s;
            }
         }
         id[k] = 0;
      }
      const char *r = strstr(query, "rate=");
      if (r) rate = atoi(r + 5);
      if (!id[0]) {
         respond_text(fd, 400, "Bad Request", "Which plugin?");
         return;
      }
      route_params(fd, id, rate);
      return;
   }
   if (!strcmp(path, "/api/render")) {
      if (strcmp(method, "POST")) {
         respond_text(fd, 405, "Method Not Allowed", "POST a render request here.");
         return;
      }
      char   lbuf[64];
      size_t clen = hdr_get(head, "content-length", lbuf, sizeof lbuf) ? strtoul(lbuf, NULL, 10) : 0;
      if (!clen || clen > MAX_BODY) {
         respond_text(fd, 413, "Payload Too Large", "That body is missing or too large.");
         return;
      }
      unsigned char *body = malloc(clen);
      if (!body) {
         respond_text(fd, 503, "Service Unavailable", "Not enough memory for that render.");
         return;
      }
      size_t have = hlen - head_len;
      if (have > clen) have = clen;
      memcpy(body, head + head_len, have);
      while (have < clen) {
         ssize_t n = recv(fd, body + have, clen - have, 0);
         if (n <= 0) {
            free(body);
            return;
         }
         have += (size_t)n;
      }
      route_render(fd, body, clen);
      free(body);
      return;
   }
   respond_text(fd, 404, "Not Found", "No such path.");
}

// ------------------------------------------------------------------------ main

static char *exe_dir(const char *argv0) {
   char buf[4096];
   ssize_t n = readlink("/proc/self/exe", buf, sizeof buf - 1);
   if (n > 0)
      buf[n] = 0;
   else
      snprintf(buf, sizeof buf, "%s", argv0);
   char *slash = strrchr(buf, '/');
   if (slash) *slash = 0;
   return xstrdup(buf);
}

int main(int argc, char **argv) {
   char **extra = xmalloc((size_t)argc * sizeof *extra);
   int    nextra = 0;
   int    no_open = 0;

   for (int i = 1; i < argc; i++) {
      if (!strcmp(argv[i], "--port") && i + 1 < argc)
         port = atoi(argv[++i]);
      else if (!strcmp(argv[i], "--page") && i + 1 < argc)
         page_path = xstrdup(argv[++i]);
      else if (!strcmp(argv[i], "--scan") && i + 1 < argc)
         extra[nextra++] = argv[++i];
      else if (!strcmp(argv[i], "--verbose") || !strcmp(argv[i], "-v"))
         verbose = 1;
      else if (!strcmp(argv[i], "--no-open"))
         no_open = 1;
      else if (!strcmp(argv[i], "--token") && i + 1 < argc) {
         if (strlen(argv[i + 1]) >= sizeof token) {
            say("--token is longer than %zu characters", sizeof token - 1);
            return 1;
         }
         snprintf(token, sizeof token, "%s", argv[++i]);
      }
      else {
         printf("pluginhost — your CLAP plugins, played in a browser\n\n"
                "  --port N       listen on 127.0.0.1:N (default 7777)\n"
                "  --scan PATH    also scan this folder, or load this one .clap\n"
                "  --page FILE    serve this page.html\n"
                "  --token TOK    use this token instead of a fresh random one\n"
                "  --no-open      do not try to open a browser\n"
                "  -v, --verbose  log what each plugin says\n");
         return strcmp(argv[i], "--help") && strcmp(argv[i], "-h");
      }
   }
   if (!token[0]) gen_token();

   if (!page_path) {
      char *dir = exe_dir(argv[0]);
      char  p[4096];
      snprintf(p, sizeof p, "%s/page.html", dir);
      if (is_file(p)) page_path = xstrdup(p);
      free(dir);
      if (!page_path && is_file("page.html")) page_path = xstrdup("page.html");
      if (!page_path && is_file("pluginhost/page.html")) page_path = xstrdup("pluginhost/page.html");
   }

   say("pluginhost: scanning for CLAP plugins…");
   scan_all(extra, nextra);
   say("pluginhost: %d plugin%s found", nfound, nfound == 1 ? "" : "s");
   for (int i = 0; i < nfound && verbose; i++)
      say("  %s — %s (%s)", found[i].name, found[i].vendor, found[i].id);

   int srv = socket(AF_INET, SOCK_STREAM, 0);
   if (srv < 0) {
      say("socket: %s", strerror(errno));
      return 1;
   }
   int one = 1;
   setsockopt(srv, SOL_SOCKET, SO_REUSEADDR, &one, sizeof one);
   struct sockaddr_in addr = {0};
   addr.sin_family = AF_INET;
   addr.sin_port = htons((uint16_t)port);
   // Loopback only, always. There is no flag to change this, because a program
   // that dlopens arbitrary native code has no business on a network.
   addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
   if (bind(srv, (struct sockaddr *)&addr, sizeof addr) < 0) {
      say("cannot listen on 127.0.0.1:%d — %s", port, strerror(errno));
      return 1;
   }
   if (listen(srv, 16) < 0) {
      say("listen: %s", strerror(errno));
      return 1;
   }

   printf("\n  Open this, and only this:\n\n    http://127.0.0.1:%d/\n\n", port);
   printf("  Ctrl-C when you are done.\n\n");
   fflush(stdout);

   if (!no_open) {
      char cmd[256];
#if defined(__APPLE__)
      snprintf(cmd, sizeof cmd, "open 'http://127.0.0.1:%d/' >/dev/null 2>&1 &", port);
#else
      snprintf(cmd, sizeof cmd, "xdg-open 'http://127.0.0.1:%d/' >/dev/null 2>&1 &", port);
#endif
      if (system(cmd) != 0 && verbose) say("could not open a browser; do it by hand");
   }

   // One request at a time, deliberately. CLAP's threading rules are about which
   // thread may call what, and the simplest way to never break them is to have
   // one thread. A local tool with one user does not need more.
   for (;;) {
      int fd = accept(srv, NULL, NULL);
      if (fd < 0) {
         if (errno == EINTR) continue;
         break;
      }
      setsockopt(fd, IPPROTO_TCP, TCP_NODELAY, &one, sizeof one);
      handle(fd);
      close(fd);
   }
   unload();
   return 0;
}
