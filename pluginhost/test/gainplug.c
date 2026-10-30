// A CLAP plugin that exists to be measured, not listened to.
//
// The host needs proving on a machine with no plugins installed, and a real
// plugin is a bad test subject: you cannot assert anything exact about a reverb.
// This one is exactly predictable —
//
//     out = in[n - LATENCY] * gain + offset
//
// — and it reports LATENCY through clap.latency while actually delaying by that
// much. So if the host's delay compensation is right, a render with gain 1 and
// offset 0 returns the input unchanged, sample for sample. If the compensation
// is off by even one frame, the test sees it.

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <clap/clap.h>

#define LATENCY 64
#define MAXCH 2

enum { P_GAIN = 0, P_OFFSET = 1, P_COUNT = 2 };

typedef struct {
   clap_plugin_t plugin;
   double        gain, offset;
   float         delay[MAXCH][LATENCY];
   uint32_t      delay_pos;
   uint32_t      channels;
} Gain;

// ------------------------------------------------------------------- params

static uint32_t CLAP_ABI p_count(const clap_plugin_t *p) { return P_COUNT; }

static bool CLAP_ABI p_info(const clap_plugin_t *p, uint32_t idx, clap_param_info_t *out) {
   memset(out, 0, sizeof *out);
   if (idx == P_GAIN) {
      out->id = P_GAIN;
      out->flags = CLAP_PARAM_IS_AUTOMATABLE;
      snprintf(out->name, sizeof out->name, "Gain");
      out->min_value = 0.0;
      out->max_value = 4.0;
      out->default_value = 1.0;
      return true;
   }
   if (idx == P_OFFSET) {
      out->id = P_OFFSET;
      out->flags = CLAP_PARAM_IS_AUTOMATABLE;
      snprintf(out->name, sizeof out->name, "Offset");
      out->min_value = -1.0;
      out->max_value = 1.0;
      out->default_value = 0.0;
      return true;
   }
   return false;
}

static bool CLAP_ABI p_get(const clap_plugin_t *p, clap_id id, double *out) {
   Gain *g = p->plugin_data;
   if (id == P_GAIN) {
      *out = g->gain;
      return true;
   }
   if (id == P_OFFSET) {
      *out = g->offset;
      return true;
   }
   return false;
}

static bool CLAP_ABI p_to_text(const clap_plugin_t *p, clap_id id, double v, char *buf,
                               uint32_t cap) {
   snprintf(buf, cap, id == P_GAIN ? "%.2f x" : "%+.3f", v);
   return true;
}
static bool CLAP_ABI p_from_text(const clap_plugin_t *p, clap_id id, const char *txt, double *out) {
   *out = atof(txt);
   return true;
}

static void apply(Gain *g, const clap_input_events_t *in, uint32_t upto) {
   if (!in) return;
   uint32_t n = in->size(in);
   for (uint32_t i = 0; i < n; i++) {
      const clap_event_header_t *h = in->get(in, i);
      if (!h || h->space_id != CLAP_CORE_EVENT_SPACE_ID) continue;
      if (h->type != CLAP_EVENT_PARAM_VALUE || h->time > upto) continue;
      const clap_event_param_value_t *e = (const clap_event_param_value_t *)h;
      if (e->param_id == P_GAIN) g->gain = e->value;
      if (e->param_id == P_OFFSET) g->offset = e->value;
   }
}

static void CLAP_ABI p_flush(const clap_plugin_t *p, const clap_input_events_t *in,
                             const clap_output_events_t *out) {
   apply(p->plugin_data, in, UINT32_MAX);
}

static const clap_plugin_params_t params_ext = {p_count,   p_info,      p_get,
                                                p_to_text, p_from_text, p_flush};

// -------------------------------------------------------------- audio ports

static uint32_t CLAP_ABI ap_count(const clap_plugin_t *p, bool is_input) { return 1; }
static bool CLAP_ABI ap_get(const clap_plugin_t *p, uint32_t idx, bool is_input,
                            clap_audio_port_info_t *info) {
   if (idx) return false;
   memset(info, 0, sizeof *info);
   info->id = is_input ? 0 : 1;
   snprintf(info->name, sizeof info->name, is_input ? "In" : "Out");
   info->flags = CLAP_AUDIO_PORT_IS_MAIN;
   info->channel_count = 2;
   info->port_type = CLAP_PORT_STEREO;
   info->in_place_pair = CLAP_INVALID_ID;
   return true;
}
static const clap_plugin_audio_ports_t ports_ext = {ap_count, ap_get};

// ------------------------------------------------------------------ latency

static uint32_t CLAP_ABI lat_get(const clap_plugin_t *p) { return LATENCY; }
static const clap_plugin_latency_t latency_ext = {lat_get};

// ------------------------------------------------------------------- plugin

static bool CLAP_ABI pl_init(const clap_plugin_t *p) { return true; }

static void CLAP_ABI pl_destroy(const clap_plugin_t *p) { free(p->plugin_data); }

static bool CLAP_ABI pl_activate(const clap_plugin_t *p, double rate, uint32_t min, uint32_t max) {
   Gain *g = p->plugin_data;
   memset(g->delay, 0, sizeof g->delay);
   g->delay_pos = 0;
   return true;
}
static void CLAP_ABI pl_deactivate(const clap_plugin_t *p) {}
static bool CLAP_ABI pl_start(const clap_plugin_t *p) { return true; }
static void CLAP_ABI pl_stop(const clap_plugin_t *p) {}
static void CLAP_ABI pl_reset(const clap_plugin_t *p) {
   Gain *g = p->plugin_data;
   memset(g->delay, 0, sizeof g->delay);
   g->delay_pos = 0;
}

static clap_process_status CLAP_ABI pl_process(const clap_plugin_t *p, const clap_process_t *pr) {
   Gain *g = p->plugin_data;
   apply(g, pr->in_events, UINT32_MAX);  // everything at block granularity: exactness beats nuance

   if (!pr->audio_outputs || !pr->audio_outputs[0].data32) return CLAP_PROCESS_ERROR;
   uint32_t frames = pr->frames_count;
   uint32_t out_ch = pr->audio_outputs[0].channel_count;
   uint32_t in_ch = (pr->audio_inputs_count && pr->audio_inputs[0].data32)
                       ? pr->audio_inputs[0].channel_count
                       : 0;

   for (uint32_t i = 0; i < frames; i++) {
      uint32_t slot = (g->delay_pos + i) % LATENCY;
      for (uint32_t c = 0; c < out_ch && c < MAXCH; c++) {
         float fresh = (c < in_ch) ? pr->audio_inputs[0].data32[c][i] : 0.f;
         float aged = g->delay[c][slot];
         g->delay[c][slot] = fresh;
         pr->audio_outputs[0].data32[c][i] = (float)(aged * g->gain + g->offset);
      }
   }
   g->delay_pos = (g->delay_pos + frames) % LATENCY;
   return CLAP_PROCESS_CONTINUE;
}

static const void *CLAP_ABI pl_get_ext(const clap_plugin_t *p, const char *id) {
   if (!strcmp(id, CLAP_EXT_PARAMS)) return &params_ext;
   if (!strcmp(id, CLAP_EXT_AUDIO_PORTS)) return &ports_ext;
   if (!strcmp(id, CLAP_EXT_LATENCY)) return &latency_ext;
   return NULL;
}
static void CLAP_ABI pl_on_main(const clap_plugin_t *p) {}

static const char *const features[] = {CLAP_PLUGIN_FEATURE_AUDIO_EFFECT, CLAP_PLUGIN_FEATURE_UTILITY,
                                       NULL};

static const clap_plugin_descriptor_t descriptor = {
   .clap_version = CLAP_VERSION_INIT,
   .id = "com.lucidsoup.gainplug",
   .name = "Gainplug",
   .vendor = "lucidsoup",
   .url = "https://www.lucidsoup.com",
   .version = "1.0.0",
   .description = "Exactly measurable gain and offset, with a declared latency, for testing a host.",
   .features = features,
};

// ------------------------------------------------------------------ factory

static uint32_t CLAP_ABI f_count(const clap_plugin_factory_t *f) { return 1; }
static const clap_plugin_descriptor_t *CLAP_ABI f_descriptor(const clap_plugin_factory_t *f,
                                                             uint32_t idx) {
   return idx == 0 ? &descriptor : NULL;
}
static const clap_plugin_t *CLAP_ABI f_create(const clap_plugin_factory_t *f,
                                              const clap_host_t *host, const char *id) {
   if (!id || strcmp(id, descriptor.id)) return NULL;
   Gain *g = calloc(1, sizeof *g);
   if (!g) return NULL;
   g->gain = 1.0;
   g->offset = 0.0;
   g->plugin.desc = &descriptor;
   g->plugin.plugin_data = g;
   g->plugin.init = pl_init;
   g->plugin.destroy = pl_destroy;
   g->plugin.activate = pl_activate;
   g->plugin.deactivate = pl_deactivate;
   g->plugin.start_processing = pl_start;
   g->plugin.stop_processing = pl_stop;
   g->plugin.reset = pl_reset;
   g->plugin.process = pl_process;
   g->plugin.get_extension = pl_get_ext;
   g->plugin.on_main_thread = pl_on_main;
   return &g->plugin;
}
static const clap_plugin_factory_t factory = {f_count, f_descriptor, f_create};

// -------------------------------------------------------------------- entry

static bool CLAP_ABI e_init(const char *path) { return true; }
static void CLAP_ABI e_deinit(void) {}
static const void *CLAP_ABI e_get_factory(const char *id) {
   return strcmp(id, CLAP_PLUGIN_FACTORY_ID) ? NULL : &factory;
}

CLAP_EXPORT const clap_plugin_entry_t clap_entry = {
   .clap_version = CLAP_VERSION_INIT,
   .init = e_init,
   .deinit = e_deinit,
   .get_factory = e_get_factory,
};
