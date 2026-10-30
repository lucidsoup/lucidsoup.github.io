// CLAP, which is the easy one: a plain C ABI in MIT headers, no SDK to fetch
// and no licence to agree to. Everything here is the format's own business —
// the preroll, the latency compensation and the block splitting live in host.c
// and are shared with VST3.

#define _GNU_SOURCE
#include <dirent.h>
#include <dlfcn.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <clap/clap.h>

#include "host.h"

// ------------------------------------------------------------------ the host

static bool host_is_audio = false;
static Buf  complaints = {0};

static void CLAP_ABI h_log(const clap_host_t *h, clap_log_severity sev, const char *msg) {
   (void)h;
   static const char *names[] = {"debug", "info", "warning", "error", "fatal",
                                 "host-misbehaving", "plugin-misbehaving"};
   const char *n = (sev >= 0 && sev <= 6) ? names[sev] : "?";
   if (verbose || sev >= CLAP_LOG_WARNING) say("  plugin [%s] %s", n, msg ? msg : "");
   // Kept for the page, so a plugin that explains its own refusal is not silent.
   if (sev >= CLAP_LOG_WARNING && complaints.len < 4000) {
      if (complaints.len) buf_str(&complaints, "\n");
      buf_fmt(&complaints, "[%s] %s", n, msg ? msg : "");
   }
}
static bool CLAP_ABI h_is_main(const clap_host_t *h) { (void)h; return !host_is_audio; }
static bool CLAP_ABI h_is_audio(const clap_host_t *h) { (void)h; return host_is_audio; }
static void CLAP_ABI h_rescan(const clap_host_t *h, clap_param_rescan_flags f) { (void)h; (void)f; }
static void CLAP_ABI h_clear(const clap_host_t *h, clap_id i, clap_param_clear_flags f) {
   (void)h; (void)i; (void)f;
}
static void CLAP_ABI h_flush(const clap_host_t *h) { (void)h; }
static void CLAP_ABI h_lat_changed(const clap_host_t *h) { (void)h; }
static void CLAP_ABI h_dirty(const clap_host_t *h) { (void)h; }
static void CLAP_ABI h_restart(const clap_host_t *h) { (void)h; }
static void CLAP_ABI h_process(const clap_host_t *h) { (void)h; }
static void CLAP_ABI h_callback(const clap_host_t *h) { (void)h; }

static const clap_host_log_t          ext_log = {h_log};
static const clap_host_thread_check_t ext_thread = {h_is_main, h_is_audio};
static const clap_host_params_t       ext_params = {h_rescan, h_clear, h_flush};
static const clap_host_latency_t      ext_latency = {h_lat_changed};
static const clap_host_state_t        ext_state = {h_dirty};

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
   .request_restart = h_restart,
   .request_process = h_process,
   .request_callback = h_callback,
};

// ------------------------------------------------------------------- scanning

static bool claims(const char *path) { return ends_with(path, ".clap"); }

// The directories the CLAP specification tells hosts to look in, plus anything
// named in CLAP_PATH, which is how a plugin kept somewhere else gets found.
static int dirs(char **out, int max) {
   int   n = 0;
   char  buf[4096];
   const char *home = getenv("HOME");
#if defined(__APPLE__)
   if (n < max) out[n++] = xstrdup("/Library/Audio/Plug-Ins/CLAP");
   if (home && n < max) {
      snprintf(buf, sizeof buf, "%s/Library/Audio/Plug-Ins/CLAP", home);
      out[n++] = xstrdup(buf);
   }
#else
   if (n < max) out[n++] = xstrdup("/usr/lib/clap");
   if (n < max) out[n++] = xstrdup("/usr/local/lib/clap");
   if (home && n < max) {
      snprintf(buf, sizeof buf, "%s/.clap", home);
      out[n++] = xstrdup(buf);
   }
#endif
   const char *env = getenv("CLAP_PATH");
   if (env && *env) {
      char *copy = xstrdup(env), *save = NULL;
      for (char *t = strtok_r(copy, ":", &save); t && n < max; t = strtok_r(NULL, ":", &save))
         out[n++] = xstrdup(t);
      free(copy);
   }
   return n;
}

// On Linux and Windows a .clap is the shared library itself. On macOS it is a
// bundle directory with the library at Contents/MacOS/<something>, and the name
// in there need not match the bundle, so take whatever file is present.
static char *resolve_dso(const char *bundle) {
   if (is_file(bundle)) return xstrdup(bundle);
   if (!is_dir(bundle)) return NULL;
   char macos[3072];
   if (snprintf(macos, sizeof macos, "%s/Contents/MacOS", bundle) >= (int)sizeof macos) return NULL;
   DIR *d = opendir(macos);
   if (!d) return NULL;
   char          *out = NULL;
   struct dirent *e;
   while ((e = readdir(d))) {
      if (e->d_name[0] == '.') continue;
      char p[4096];
      if (snprintf(p, sizeof p, "%s/%s", macos, e->d_name) >= (int)sizeof p) continue;
      if (is_file(p)) { out = xstrdup(p); break; }
   }
   closedir(d);
   return out;
}

// Open it, copy out what its factory says, and close it again. The descriptors
// belong to the plugin and die with deinit(), so every string that outlives
// this call is duplicated here.
static void scan(const char *bundle, const Backend *self) {
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
         Buf id = {0};
         buf_fmt(&id, "clap:%s", d->id);
         Found got = {.bundle = xstrdup(bundle),
                      .dso = xstrdup(dso),
                      .id = xstrdup(id.s),
                      .name = xstrdup(d->name ? d->name : d->id),
                      .vendor = xstrdup(d->vendor ? d->vendor : ""),
                      .version = xstrdup(d->version ? d->version : ""),
                      .descr = xstrdup(d->description ? d->description : ""),
                      .features = xstrdup(feat.s ? feat.s : ""),
                      .be = self};
         free(feat.s);
         free(id.s);
         found_push(got);
      }
   }
   if (entry->deinit) entry->deinit();
   dlclose(lib);
   free(dso);
}

// ------------------------------------------------------- one plugin, kept open

static struct {
   char                            *dso, *id;
   void                            *lib;
   const clap_plugin_entry_t       *entry;
   const clap_plugin_t             *plug;
   const clap_plugin_params_t      *params;
   const clap_plugin_audio_ports_t *ports;
   const clap_plugin_latency_t     *lat;
   double                           rate;
   uint32_t                         in_ch, out_ch;
   bool                             active, processing;
} open_plug = {0};

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

static uint32_t port_channels(const clap_plugin_t *p, const clap_plugin_audio_ports_t *ap,
                              bool input, uint32_t fallback) {
   if (!ap || !ap->count) return fallback;
   if (ap->count(p, input) == 0) return 0;
   clap_audio_port_info_t info;
   memset(&info, 0, sizeof info);
   if (!ap->get(p, 0, input, &info)) return fallback;
   return info.channel_count;
}

static const char *load(const Found *f, double rate) {
   if (open_plug.plug && !strcmp(open_plug.id, f->id) && open_plug.rate == rate) return NULL;
   unload();
   complaints.len = 0;
   if (complaints.s) complaints.s[0] = 0;

   const char *bare = strchr(f->id, ':');
   bare = bare ? bare + 1 : f->id;

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
   const clap_plugin_t *p = fac->create_plugin(fac, &the_host, bare);
   if (!p) {
      if (entry->deinit) entry->deinit();
      dlclose(lib);
      return "The plugin would not instantiate.";
   }
   open_plug.lib = lib;
   open_plug.entry = entry;
   open_plug.plug = p;
   open_plug.dso = xstrdup(f->dso);
   open_plug.id = xstrdup(f->id);

   if (p->init && !p->init(p)) {
      unload();
      return "The plugin's init() failed.";
   }
   open_plug.params = p->get_extension ? p->get_extension(p, CLAP_EXT_PARAMS) : NULL;
   open_plug.ports = p->get_extension ? p->get_extension(p, CLAP_EXT_AUDIO_PORTS) : NULL;
   open_plug.lat = p->get_extension ? p->get_extension(p, CLAP_EXT_LATENCY) : NULL;
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

static uint32_t in_channels(void) { return open_plug.in_ch; }
static uint32_t out_channels(void) { return open_plug.out_ch; }
static uint32_t latency(void) {
   return open_plug.lat && open_plug.lat->get ? open_plug.lat->get(open_plug.plug) : 0;
}
static const char *complaint(void) { return complaints.s ? complaints.s : ""; }

static uint32_t param_count(void) {
   return open_plug.params && open_plug.params->count ? open_plug.params->count(open_plug.plug) : 0;
}

static bool param_at(uint32_t index, ParamInfo *out) {
   const clap_plugin_t        *p = open_plug.plug;
   const clap_plugin_params_t *pp = open_plug.params;
   clap_param_info_t           info;
   memset(&info, 0, sizeof info);
   if (!pp || !pp->get_info(p, index, &info)) return false;
   if (info.flags & CLAP_PARAM_IS_HIDDEN) return false;

   double value = info.default_value;
   if (pp->get_value) pp->get_value(p, info.id, &value);
   memset(out, 0, sizeof *out);
   out->id = info.id;
   // CLAP allows a longer name and a much longer module path than the page has
   // any use for; the precision says the cut is meant rather than overlooked.
   snprintf(out->name, sizeof out->name, "%.*s", (int)sizeof out->name - 1, info.name);
   snprintf(out->module, sizeof out->module, "%.*s", (int)sizeof out->module - 1, info.module);
   if (pp->value_to_text) pp->value_to_text(p, info.id, value, out->text, sizeof out->text);
   out->min = info.min_value;
   out->max = info.max_value;
   out->def = info.default_value;
   out->value = value;
   out->stepped = (info.flags & CLAP_PARAM_IS_STEPPED) != 0;
   out->is_enum = (info.flags & CLAP_PARAM_IS_ENUM) != 0;
   out->readonly = (info.flags & CLAP_PARAM_IS_READONLY) != 0;
   out->bypass = (info.flags & CLAP_PARAM_IS_BYPASS) != 0;
   return true;
}

// ------------------------------------------------------------------ processing

typedef union {
   clap_event_header_t      hdr;
   clap_event_param_value_t pv;
   clap_event_note_t        note;
} AnyEvent;

static AnyEvent             *evbuf = NULL;
static clap_event_header_t **evptr = NULL;
static uint32_t              evcap = 0, evcount = 0;

static uint32_t CLAP_ABI ev_size(const clap_input_events_t *l) { (void)l; return evcount; }
static const clap_event_header_t *CLAP_ABI ev_get(const clap_input_events_t *l, uint32_t i) {
   (void)l;
   return i < evcount ? evptr[i] : NULL;
}
static bool CLAP_ABI ev_push(const clap_output_events_t *l, const clap_event_header_t *e) {
   (void)l; (void)e;
   return true;  // a plugin's own output events are not used here
}

static void begin(void) {
   if (open_plug.plug && open_plug.plug->reset) open_plug.plug->reset(open_plug.plug);
}
static void end(void) {}

static bool process(const Evt *ev, uint32_t nev, float **in, float **out, uint32_t frames) {
   const clap_plugin_t *p = open_plug.plug;
   if (!p || !p->process) return false;

   if (nev > evcap) {
      evcap = nev + 16;
      evbuf = realloc(evbuf, evcap * sizeof *evbuf);
      evptr = realloc(evptr, evcap * sizeof *evptr);
      if (!evbuf || !evptr) return false;
   }
   evcount = 0;
   for (uint32_t i = 0; i < nev; i++) {
      AnyEvent *slot = &evbuf[evcount];
      memset(slot, 0, sizeof *slot);
      if (ev[i].kind == EVT_PARAM) {
         slot->pv.header.size = sizeof slot->pv;
         slot->pv.header.type = CLAP_EVENT_PARAM_VALUE;
         slot->pv.param_id = ev[i].param_id;
         slot->pv.note_id = -1;
         slot->pv.port_index = -1;
         slot->pv.channel = -1;
         slot->pv.key = -1;
         slot->pv.value = ev[i].value;
      } else {
         slot->note.header.size = sizeof slot->note;
         slot->note.header.type = ev[i].kind == EVT_NOTE_ON ? CLAP_EVENT_NOTE_ON : CLAP_EVENT_NOTE_OFF;
         slot->note.note_id = ev[i].note_id;
         slot->note.port_index = 0;
         slot->note.channel = ev[i].channel;
         slot->note.key = ev[i].key;
         slot->note.velocity = ev[i].value;
      }
      slot->hdr.time = ev[i].time;
      slot->hdr.space_id = CLAP_CORE_EVENT_SPACE_ID;
      evptr[evcount] = &slot->hdr;
      evcount++;
   }

   clap_input_events_t  ins = {.ctx = NULL, .size = ev_size, .get = ev_get};
   clap_output_events_t outs = {.ctx = NULL, .try_push = ev_push};
   clap_audio_buffer_t  ab_in = {0}, ab_out = {0};
   ab_in.data32 = in;
   ab_in.channel_count = open_plug.in_ch;
   ab_out.data32 = out;
   ab_out.channel_count = open_plug.out_ch;

   clap_process_t pr = {0};
   pr.frames_count = frames;
   pr.audio_inputs = in ? &ab_in : NULL;
   pr.audio_inputs_count = in ? 1 : 0;
   pr.audio_outputs = &ab_out;
   pr.audio_outputs_count = 1;
   pr.in_events = &ins;
   pr.out_events = &outs;

   host_is_audio = true;
   int st = p->process(p, &pr);
   host_is_audio = false;
   return st != CLAP_PROCESS_ERROR;
}

const Backend clap_backend = {
   .name = "clap",
   .claims = claims,
   .dirs = dirs,
   .scan = scan,
   .load = load,
   .unload = unload,
   .in_channels = in_channels,
   .out_channels = out_channels,
   .latency = latency,
   .param_count = param_count,
   .param_at = param_at,
   .begin = begin,
   .process = process,
   .end = end,
   .complaint = complaint,
};
