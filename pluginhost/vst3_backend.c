// VST3, which is the awkward one.
//
// Where CLAP is plain C structs of function pointers, VST3 is COM: every object
// is a pointer to a vtable, lifetimes are reference counted, and you ask for an
// interface by passing a 16-byte id to queryInterface. None of that needs C++ —
// the ABI is just vtables — and Steinberg publish a single-header C binding for
// it under a BSD licence, so this is one more file rather than a dependency on
// the GPL/proprietary C++ SDK.
//
// Four of the objects here go the other way: IParameterChanges, IParamValueQueue,
// IEventList and IHostApplication are implemented BY the host and called BY the
// plugin, so they are hand-built vtables with a C struct behind them.
//
// Two other VST3 facts drive the shape of this file:
//   - Parameters are always normalised to 0..1. The plain value is the plugin's
//     private business and only ever surfaces as display text.
//   - The processor and the editor are two different objects, sometimes two
//     different classes. Audio goes to one and parameter names come from the
//     other, and they have to be introduced to each other by hand.

#define _GNU_SOURCE
#include <dirent.h>
#include <dlfcn.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "vst3_c_api.h"

#include "host.h"

#define MAXBUS 8
#define MAXPOINTS 64
#define MAXQUEUES 256
#define MAXEVENTS 256

// "Audio Module Class" is what VST3 calls an audio plugin; a factory also lists
// controller classes and other things we have no use for.
static const char *AUDIO_CLASS = "Audio Module Class";

static Buf complaints = {0};

static bool tuid_eq(const Steinberg_TUID a, const Steinberg_TUID b) {
   return memcmp(a, b, 16) == 0;
}

// String128 is UTF-16. Everything else here speaks UTF-8.
static void from_utf16(const Steinberg_char16 *in, char *out, size_t cap) {
   size_t o = 0;
   for (int i = 0; i < 128 && in[i] && o + 5 < cap; i++) {
      unsigned int c = (unsigned short)in[i];
      // A character outside the basic plane arrives as a surrogate pair.
      if (c >= 0xD800 && c <= 0xDBFF && i + 1 < 128) {
         unsigned int lo = (unsigned short)in[i + 1];
         if (lo >= 0xDC00 && lo <= 0xDFFF) {
            c = 0x10000 + ((c - 0xD800) << 10) + (lo - 0xDC00);
            i++;
         }
      }
      if (c < 0x80) {
         out[o++] = (char)c;
      } else if (c < 0x800) {
         out[o++] = (char)(0xC0 | (c >> 6));
         out[o++] = (char)(0x80 | (c & 0x3F));
      } else if (c < 0x10000) {
         out[o++] = (char)(0xE0 | (c >> 12));
         out[o++] = (char)(0x80 | ((c >> 6) & 0x3F));
         out[o++] = (char)(0x80 | (c & 0x3F));
      } else {
         out[o++] = (char)(0xF0 | (c >> 18));
         out[o++] = (char)(0x80 | ((c >> 12) & 0x3F));
         out[o++] = (char)(0x80 | ((c >> 6) & 0x3F));
         out[o++] = (char)(0x80 | (c & 0x3F));
      }
   }
   out[o] = 0;
}

// ------------------------------------------------- objects the plugin calls back

// A VST3 plugin reads its automation out of a list of per-parameter queues that
// the host supplies, so the host has to be the one implementing them.

typedef struct {
   struct Steinberg_Vst_IParamValueQueue base;
   Steinberg_Vst_ParamID                 id;
   Steinberg_int32                       count;
   struct {
      Steinberg_int32            offset;
      Steinberg_Vst_ParamValue   value;
   } pts[MAXPOINTS];
} Queue;

typedef struct {
   struct Steinberg_Vst_IParameterChanges base;
   Steinberg_int32                        count;
   Queue                                  q[MAXQUEUES];
} Changes;

typedef struct {
   struct Steinberg_Vst_IEventList base;
   Steinberg_int32                 count;
   struct Steinberg_Vst_Event      ev[MAXEVENTS];
} Events;

// These live for the whole run and are never freed, so reference counting is a
// formality: say one, and mean it.
static Steinberg_uint32 SMTG_STDMETHODCALLTYPE one_ref(void *me) { (void)me; return 1; }

static Steinberg_tresult SMTG_STDMETHODCALLTYPE q_qi(void *me, const Steinberg_TUID iid,
                                                     void **obj) {
   if (tuid_eq(iid, Steinberg_Vst_IParamValueQueue_iid) || tuid_eq(iid, Steinberg_FUnknown_iid)) {
      *obj = me;
      return Steinberg_kResultOk;
   }
   *obj = NULL;
   return Steinberg_kNoInterface;
}
static Steinberg_Vst_ParamID SMTG_STDMETHODCALLTYPE q_id(void *me) { return ((Queue *)me)->id; }
static Steinberg_int32 SMTG_STDMETHODCALLTYPE q_points(void *me) { return ((Queue *)me)->count; }
static Steinberg_tresult SMTG_STDMETHODCALLTYPE q_get(void *me, Steinberg_int32 i,
                                                      Steinberg_int32 *off,
                                                      Steinberg_Vst_ParamValue *val) {
   Queue *q = me;
   if (i < 0 || i >= q->count) return Steinberg_kResultFalse;
   *off = q->pts[i].offset;
   *val = q->pts[i].value;
   return Steinberg_kResultOk;
}
static Steinberg_tresult SMTG_STDMETHODCALLTYPE q_add(void *me, Steinberg_int32 off,
                                                      Steinberg_Vst_ParamValue val,
                                                      Steinberg_int32 *index) {
   Queue *q = me;
   if (q->count >= MAXPOINTS) return Steinberg_kResultFalse;
   q->pts[q->count].offset = off;
   q->pts[q->count].value = val;
   if (index) *index = q->count;
   q->count++;
   return Steinberg_kResultOk;
}
static struct Steinberg_Vst_IParamValueQueueVtbl queue_vtbl = {
   q_qi, one_ref, one_ref, q_id, q_points, q_get, q_add};

static Steinberg_tresult SMTG_STDMETHODCALLTYPE c_qi(void *me, const Steinberg_TUID iid,
                                                     void **obj) {
   if (tuid_eq(iid, Steinberg_Vst_IParameterChanges_iid) || tuid_eq(iid, Steinberg_FUnknown_iid)) {
      *obj = me;
      return Steinberg_kResultOk;
   }
   *obj = NULL;
   return Steinberg_kNoInterface;
}
static Steinberg_int32 SMTG_STDMETHODCALLTYPE c_count(void *me) { return ((Changes *)me)->count; }
static struct Steinberg_Vst_IParamValueQueue *SMTG_STDMETHODCALLTYPE c_get(void *me,
                                                                           Steinberg_int32 i) {
   Changes *c = me;
   return (i >= 0 && i < c->count) ? (struct Steinberg_Vst_IParamValueQueue *)&c->q[i] : NULL;
}
static struct Steinberg_Vst_IParamValueQueue *SMTG_STDMETHODCALLTYPE
c_add(void *me, const Steinberg_Vst_ParamID *id, Steinberg_int32 *index) {
   Changes *c = me;
   for (Steinberg_int32 i = 0; i < c->count; i++)
      if (c->q[i].id == *id) {
         if (index) *index = i;
         return (struct Steinberg_Vst_IParamValueQueue *)&c->q[i];
      }
   if (c->count >= MAXQUEUES) return NULL;
   Queue *q = &c->q[c->count];
   q->base.lpVtbl = &queue_vtbl;
   q->id = *id;
   q->count = 0;
   if (index) *index = c->count;
   c->count++;
   return (struct Steinberg_Vst_IParamValueQueue *)q;
}
static struct Steinberg_Vst_IParameterChangesVtbl changes_vtbl = {c_qi,    one_ref, one_ref,
                                                                  c_count, c_get,   c_add};

static Steinberg_tresult SMTG_STDMETHODCALLTYPE e_qi(void *me, const Steinberg_TUID iid,
                                                     void **obj) {
   if (tuid_eq(iid, Steinberg_Vst_IEventList_iid) || tuid_eq(iid, Steinberg_FUnknown_iid)) {
      *obj = me;
      return Steinberg_kResultOk;
   }
   *obj = NULL;
   return Steinberg_kNoInterface;
}
static Steinberg_int32 SMTG_STDMETHODCALLTYPE e_count(void *me) { return ((Events *)me)->count; }
static Steinberg_tresult SMTG_STDMETHODCALLTYPE e_get(void *me, Steinberg_int32 i,
                                                      struct Steinberg_Vst_Event *out) {
   Events *e = me;
   if (i < 0 || i >= e->count) return Steinberg_kResultFalse;
   *out = e->ev[i];
   return Steinberg_kResultOk;
}
static Steinberg_tresult SMTG_STDMETHODCALLTYPE e_add(void *me, struct Steinberg_Vst_Event *in) {
   Events *e = me;
   if (e->count >= MAXEVENTS) return Steinberg_kResultFalse;
   e->ev[e->count++] = *in;
   return Steinberg_kResultOk;
}
static struct Steinberg_Vst_IEventListVtbl events_vtbl = {e_qi,    one_ref, one_ref,
                                                          e_count, e_get,   e_add};

// Plugins ask the host who it is during initialize(). Handing them nothing is
// legal and makes a surprising number of them bail, so this answers.
typedef struct {
   struct Steinberg_Vst_IHostApplication base;
} HostApp;

static Steinberg_tresult SMTG_STDMETHODCALLTYPE ha_qi(void *me, const Steinberg_TUID iid,
                                                      void **obj) {
   if (tuid_eq(iid, Steinberg_Vst_IHostApplication_iid) || tuid_eq(iid, Steinberg_FUnknown_iid)) {
      *obj = me;
      return Steinberg_kResultOk;
   }
   *obj = NULL;
   return Steinberg_kNoInterface;
}
static Steinberg_tresult SMTG_STDMETHODCALLTYPE ha_name(void *me, Steinberg_Vst_String128 name) {
   (void)me;
   const char *s = "pluginhost";
   int         i = 0;
   for (; s[i]; i++) name[i] = (Steinberg_char16)s[i];
   name[i] = 0;
   return Steinberg_kResultOk;
}
static Steinberg_tresult SMTG_STDMETHODCALLTYPE ha_create(void *me, Steinberg_TUID cid,
                                                          Steinberg_TUID iid, void **obj) {
   (void)me; (void)cid; (void)iid;
   *obj = NULL;
   return Steinberg_kNoInterface;  // message objects are not used here
}
static struct Steinberg_Vst_IHostApplicationVtbl hostapp_vtbl = {ha_qi, one_ref, one_ref, ha_name,
                                                                 ha_create};
static HostApp host_app = {{&hostapp_vtbl}};

// ------------------------------------------------------------------- scanning

static bool claims(const char *path) { return ends_with(path, ".vst3"); }

static int dirs(char **out, int max) {
   int         n = 0;
   char        buf[4096];
   const char *home = getenv("HOME");
#if defined(__APPLE__)
   if (n < max) out[n++] = xstrdup("/Library/Audio/Plug-Ins/VST3");
   if (home && n < max) {
      snprintf(buf, sizeof buf, "%s/Library/Audio/Plug-Ins/VST3", home);
      out[n++] = xstrdup(buf);
   }
#else
   if (n < max) out[n++] = xstrdup("/usr/lib/vst3");
   if (n < max) out[n++] = xstrdup("/usr/local/lib/vst3");
   if (home && n < max) {
      snprintf(buf, sizeof buf, "%s/.vst3", home);
      out[n++] = xstrdup(buf);
   }
#endif
   const char *env = getenv("VST3_PATH");
   if (env && *env) {
      char *copy = xstrdup(env), *save = NULL;
      for (char *t = strtok_r(copy, ":", &save); t && n < max; t = strtok_r(NULL, ":", &save))
         out[n++] = xstrdup(t);
      free(copy);
   }
   return n;
}

// A .vst3 is normally a bundle, and where the library sits inside it depends on
// the platform: Contents/x86_64-linux/… on Linux, Contents/MacOS/… on a Mac.
// It is also allowed to be a plain shared library with a .vst3 name.
static char *resolve_dso(const char *bundle) {
   if (is_file(bundle)) return xstrdup(bundle);
   if (!is_dir(bundle)) return NULL;
   const char *subs[] = {
#if defined(__APPLE__)
      "Contents/MacOS",
#elif defined(__aarch64__)
      "Contents/aarch64-linux", "Contents/arm64-linux",
#else
      "Contents/x86_64-linux", "Contents/i386-linux",
#endif
      NULL};
   for (int i = 0; subs[i]; i++) {
      char dir[3072];
      if (snprintf(dir, sizeof dir, "%s/%s", bundle, subs[i]) >= (int)sizeof dir) continue;
      DIR *d = opendir(dir);
      if (!d) continue;
      char          *out = NULL;
      struct dirent *e;
      while ((e = readdir(d))) {
         if (e->d_name[0] == '.') continue;
         char p[4096];
         if (snprintf(p, sizeof p, "%s/%s", dir, e->d_name) >= (int)sizeof p) continue;
         if (is_file(p)) { out = xstrdup(p); break; }
      }
      closedir(d);
      if (out) return out;
   }
   return NULL;
}

typedef bool(SMTG_STDMETHODCALLTYPE *ModuleEntryFn)(void *);
typedef bool(SMTG_STDMETHODCALLTYPE *ModuleExitFn)(void);
typedef struct Steinberg_IPluginFactory *(SMTG_STDMETHODCALLTYPE *GetFactoryFn)(void);

// The entry symbol is named per platform, and nothing but the name differs.
static ModuleEntryFn entry_of(void *lib) {
   ModuleEntryFn f = (ModuleEntryFn)dlsym(lib, "ModuleEntry");
   if (!f) f = (ModuleEntryFn)dlsym(lib, "bundleEntry");
   if (!f) f = (ModuleEntryFn)dlsym(lib, "InitDll");
   return f;
}
static ModuleExitFn exit_of(void *lib) {
   ModuleExitFn f = (ModuleExitFn)dlsym(lib, "ModuleExit");
   if (!f) f = (ModuleExitFn)dlsym(lib, "bundleExit");
   if (!f) f = (ModuleExitFn)dlsym(lib, "ExitDll");
   return f;
}

// A class id is 16 raw bytes; it has to survive in a URL and a JSON string, so
// it travels as hex and comes back the same way.
static void cid_hex(const Steinberg_TUID cid, char out[33]) {
   for (int i = 0; i < 16; i++) snprintf(out + i * 2, 3, "%02x", (unsigned char)cid[i]);
   out[32] = 0;
}
static bool hex_cid(const char *hex, Steinberg_TUID out) {
   if (strlen(hex) != 32) return false;
   for (int i = 0; i < 16; i++) {
      char b[3] = {hex[i * 2], hex[i * 2 + 1], 0};
      char *end = NULL;
      long  v = strtol(b, &end, 16);
      if (end != b + 2) return false;
      out[i] = (char)v;
   }
   return true;
}

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
   ModuleEntryFn enter = entry_of(lib);
   GetFactoryFn  getfac = (GetFactoryFn)dlsym(lib, "GetPluginFactory");
   if (!getfac) {
      say("  skipped %s: no GetPluginFactory", bundle);
      dlclose(lib);
      free(dso);
      return;
   }
   if (enter && !enter(lib)) {
      say("  skipped %s: module entry refused", bundle);
      dlclose(lib);
      free(dso);
      return;
   }
   struct Steinberg_IPluginFactory *fac = getfac();
   if (fac) {
      Steinberg_int32 n = fac->lpVtbl->countClasses(fac);
      for (Steinberg_int32 i = 0; i < n; i++) {
         struct Steinberg_PClassInfo info;
         memset(&info, 0, sizeof info);
         if (fac->lpVtbl->getClassInfo(fac, i, &info) != Steinberg_kResultOk) continue;
         if (strncmp(info.category, AUDIO_CLASS, sizeof info.category)) continue;

         // PClassInfo2 carries the vendor, version and subcategories; it is only
         // there if the plugin implements the newer factory, so ask and shrug.
         char vendor[64] = "", version[64] = "", subcats[128] = "";
         struct Steinberg_IPluginFactory2 *f2 = NULL;
         if (fac->lpVtbl->queryInterface(fac, Steinberg_IPluginFactory2_iid, (void **)&f2) ==
                Steinberg_kResultOk && f2) {
            struct Steinberg_PClassInfo2 i2;
            memset(&i2, 0, sizeof i2);
            if (f2->lpVtbl->getClassInfo2(f2, i, &i2) == Steinberg_kResultOk) {
               snprintf(vendor, sizeof vendor, "%.63s", i2.vendor);
               snprintf(version, sizeof version, "%.63s", i2.version);
               snprintf(subcats, sizeof subcats, "%.127s", i2.subCategories);
            }
            f2->lpVtbl->release(f2);
         }
         // VST3 writes subcategories as "Fx|Delay"; the page already speaks the
         // comma-separated list CLAP uses, so translate rather than special-case.
         for (char *p = subcats; *p; p++)
            if (*p == '|') *p = ',';
         Buf feat = {0};
         buf_str(&feat, strstr(subcats, "Instrument") ? "instrument" : "audio-effect");
         if (subcats[0]) buf_fmt(&feat, ",%s", subcats);

         char hex[33];
         cid_hex(info.cid, hex);
         Buf id = {0};
         buf_fmt(&id, "vst3:%s", hex);

         Found got = {.bundle = xstrdup(bundle),
                      .dso = xstrdup(dso),
                      .id = xstrdup(id.s),
                      .name = xstrdup(info.name),
                      .vendor = xstrdup(vendor),
                      .version = xstrdup(version),
                      .descr = xstrdup(""),
                      .features = xstrdup(feat.s ? feat.s : ""),
                      .be = self};
         free(feat.s);
         free(id.s);
         found_push(got);
      }
      fac->lpVtbl->release(fac);
   }
   ModuleExitFn leave = exit_of(lib);
   if (leave) leave();
   dlclose(lib);
   free(dso);
}

// ------------------------------------------------------- one plugin, kept open

static struct {
   char                                *id;
   void                                *lib;
   struct Steinberg_Vst_IComponent     *comp;
   struct Steinberg_Vst_IAudioProcessor *proc;
   struct Steinberg_Vst_IEditController *ctrl;
   bool                                  ctrl_separate;
   double                                rate;
   uint32_t in_bus[MAXBUS], out_bus[MAXBUS];
   int      n_in_bus, n_out_bus;
   bool     active, processing;
} op = {0};

// Buffers for every bus the plugin declares. VST3 expects a buffer for each one
// whether or not it is carrying anything, and handing it fewer is a reliable way
// to make a plugin read off the end of an array it trusted.
static float  *bus_mem[2][MAXBUS][16];
static float  *bus_ptr[2][MAXBUS][16];
static struct Steinberg_Vst_AudioBusBuffers abb[2][MAXBUS];

static void free_buffers(void) {
   for (int d = 0; d < 2; d++)
      for (int b = 0; b < MAXBUS; b++)
         for (int c = 0; c < 16; c++) {
            free(bus_mem[d][b][c]);
            bus_mem[d][b][c] = NULL;
         }
}

static void unload(void) {
   if (op.proc && op.processing) op.proc->lpVtbl->setProcessing(op.proc, 0);
   if (op.comp && op.active) op.comp->lpVtbl->setActive(op.comp, 0);
   if (op.ctrl && op.ctrl_separate) {
      op.ctrl->lpVtbl->terminate(op.ctrl);
      op.ctrl->lpVtbl->release(op.ctrl);
   }
   if (op.proc) op.proc->lpVtbl->release(op.proc);
   if (op.comp) {
      op.comp->lpVtbl->terminate(op.comp);
      op.comp->lpVtbl->release(op.comp);
   }
   if (op.lib) {
      ModuleExitFn leave = exit_of(op.lib);
      if (leave) leave();
      dlclose(op.lib);
   }
   free(op.id);
   free_buffers();
   memset(&op, 0, sizeof op);
}

static int buses(struct Steinberg_Vst_IComponent *c, Steinberg_Vst_BusDirection dir,
                 uint32_t *out) {
   Steinberg_int32 n = c->lpVtbl->getBusCount(c, Steinberg_Vst_MediaTypes_kAudio, dir);
   if (n > MAXBUS) n = MAXBUS;
   for (Steinberg_int32 i = 0; i < n; i++) {
      struct Steinberg_Vst_BusInfo info;
      memset(&info, 0, sizeof info);
      if (c->lpVtbl->getBusInfo(c, Steinberg_Vst_MediaTypes_kAudio, dir, i, &info) !=
          Steinberg_kResultOk) {
         out[i] = 0;
         continue;
      }
      out[i] = (uint32_t)info.channelCount;
      if (out[i] > 16) out[i] = 16;
      // Everything is switched on: an inactive main bus produces nothing, and a
      // plugin is free to ignore the ones it does not want.
      c->lpVtbl->activateBus(c, Steinberg_Vst_MediaTypes_kAudio, dir, i, 1);
   }
   return (int)n;
}

static const char *load(const Found *f, double rate) {
   if (op.comp && !strcmp(op.id, f->id) && op.rate == rate) return NULL;
   unload();
   complaints.len = 0;
   if (complaints.s) complaints.s[0] = 0;

   const char *hex = strchr(f->id, ':');
   hex = hex ? hex + 1 : f->id;
   Steinberg_TUID cid;
   if (!hex_cid(hex, cid)) return "That plugin id is not a VST3 class id.";

   void *lib = dlopen(f->dso, RTLD_LOCAL | RTLD_NOW);
   if (!lib) return "The plugin file would not open.";
   ModuleEntryFn enter = entry_of(lib);
   GetFactoryFn  getfac = (GetFactoryFn)dlsym(lib, "GetPluginFactory");
   if (!getfac || (enter && !enter(lib))) {
      dlclose(lib);
      return "The plugin module refused to start.";
   }
   op.lib = lib;
   op.id = xstrdup(f->id);

   struct Steinberg_IPluginFactory *fac = getfac();
   if (!fac) {
      unload();
      return "The plugin has no VST3 factory.";
   }
   // VST3 takes a class id as a string of 16 raw bytes, not as a TUID value.
   if (fac->lpVtbl->createInstance(fac, (Steinberg_FIDString)cid,
                                   (Steinberg_FIDString)Steinberg_Vst_IComponent_iid,
                                   (void **)&op.comp) != Steinberg_kResultOk ||
       !op.comp) {
      fac->lpVtbl->release(fac);
      unload();
      return "The plugin would not instantiate.";
   }
   if (op.comp->lpVtbl->initialize(op.comp, (struct Steinberg_FUnknown *)&host_app) !=
       Steinberg_kResultOk) {
      fac->lpVtbl->release(fac);
      unload();
      return "The plugin's initialize() failed.";
   }
   if (op.comp->lpVtbl->queryInterface(op.comp, Steinberg_Vst_IAudioProcessor_iid,
                                       (void **)&op.proc) != Steinberg_kResultOk ||
       !op.proc) {
      fac->lpVtbl->release(fac);
      unload();
      return "The plugin is not an audio processor.";
   }

   // The editor is sometimes the same object and sometimes a separate class the
   // component names. Either way the parameter list lives there, not here.
   if (op.comp->lpVtbl->queryInterface(op.comp, Steinberg_Vst_IEditController_iid,
                                       (void **)&op.ctrl) == Steinberg_kResultOk &&
       op.ctrl) {
      op.ctrl_separate = false;
   } else {
      op.ctrl = NULL;
      Steinberg_TUID ccid;
      if (op.comp->lpVtbl->getControllerClassId(op.comp, ccid) == Steinberg_kResultOk) {
         if (fac->lpVtbl->createInstance(fac, (Steinberg_FIDString)ccid,
                                         (Steinberg_FIDString)Steinberg_Vst_IEditController_iid,
                                         (void **)&op.ctrl) == Steinberg_kResultOk &&
             op.ctrl) {
            op.ctrl_separate = true;
            op.ctrl->lpVtbl->initialize(op.ctrl, (struct Steinberg_FUnknown *)&host_app);
         }
      }
   }
   fac->lpVtbl->release(fac);

   op.n_in_bus = buses(op.comp, Steinberg_Vst_BusDirections_kInput, op.in_bus);
   op.n_out_bus = buses(op.comp, Steinberg_Vst_BusDirections_kOutput, op.out_bus);
   if (op.n_out_bus < 1 || op.out_bus[0] == 0) {
      unload();
      return "The plugin has no audio output bus, so there is nothing to hear.";
   }

   struct Steinberg_Vst_ProcessSetup setup;
   setup.processMode = Steinberg_Vst_ProcessModes_kOffline;
   setup.symbolicSampleSize = Steinberg_Vst_SymbolicSampleSizes_kSample32;
   setup.maxSamplesPerBlock = BLOCK;
   setup.sampleRate = rate;
   // Offline is the honest mode for what this does, but a plugin is allowed to
   // support only realtime, and being told no is not a reason to give up.
   if (op.proc->lpVtbl->setupProcessing(op.proc, &setup) != Steinberg_kResultOk) {
      setup.processMode = Steinberg_Vst_ProcessModes_kRealtime;
      if (op.proc->lpVtbl->setupProcessing(op.proc, &setup) != Steinberg_kResultOk) {
         unload();
         return "The plugin would not set up at this sample rate.";
      }
   }
   if (op.comp->lpVtbl->setActive(op.comp, 1) != Steinberg_kResultOk) {
      unload();
      return "The plugin would not activate.";
   }
   op.active = true;
   op.proc->lpVtbl->setProcessing(op.proc, 1);
   op.processing = true;
   op.rate = rate;

   for (int d = 0; d < 2; d++) {
      int      nb = d == 0 ? op.n_in_bus : op.n_out_bus;
      uint32_t *ch = d == 0 ? op.in_bus : op.out_bus;
      for (int b = 0; b < nb; b++) {
         for (uint32_t c = 0; c < ch[b]; c++) bus_mem[d][b][c] = xmalloc(BLOCK * sizeof(float));
         abb[d][b].numChannels = (Steinberg_int32)ch[b];
         abb[d][b].silenceFlags = 0;
         abb[d][b].Steinberg_Vst_AudioBusBuffers_channelBuffers32 = bus_ptr[d][b];
      }
   }
   return NULL;
}

static uint32_t in_channels(void) { return op.n_in_bus > 0 ? op.in_bus[0] : 0; }
static uint32_t out_channels(void) { return op.out_bus[0]; }
static uint32_t latency(void) {
   return op.proc ? op.proc->lpVtbl->getLatencySamples(op.proc) : 0;
}
static const char *complaint(void) { return complaints.s ? complaints.s : ""; }

static uint32_t param_count(void) {
   return op.ctrl ? (uint32_t)op.ctrl->lpVtbl->getParameterCount(op.ctrl) : 0;
}

static bool param_at(uint32_t index, ParamInfo *out) {
   if (!op.ctrl) return false;
   struct Steinberg_Vst_ParameterInfo info;
   memset(&info, 0, sizeof info);
   if (op.ctrl->lpVtbl->getParameterInfo(op.ctrl, (Steinberg_int32)index, &info) !=
       Steinberg_kResultOk)
      return false;
   if (info.flags & Steinberg_Vst_ParameterInfo_ParameterFlags_kIsHidden) return false;
   if (info.flags & Steinberg_Vst_ParameterInfo_ParameterFlags_kIsProgramChange) return false;

   memset(out, 0, sizeof *out);
   out->id = info.id;
   from_utf16(info.title, out->name, sizeof out->name);
   from_utf16(info.units, out->module, sizeof out->module);

   double value = op.ctrl->lpVtbl->getParamNormalized(op.ctrl, info.id);
   Steinberg_Vst_String128 txt;
   memset(txt, 0, sizeof txt);
   if (op.ctrl->lpVtbl->getParamStringByValue(op.ctrl, info.id, value, txt) == Steinberg_kResultOk)
      from_utf16(txt, out->text, sizeof out->text);

   // Everything in VST3 is normalised; the plain value is the plugin's private
   // business and only ever reaches us as that display string.
   out->min = 0.0;
   out->max = 1.0;
   out->def = info.defaultNormalizedValue;
   out->value = value;
   out->stepped = info.stepCount > 0;
   out->is_enum = (info.flags & Steinberg_Vst_ParameterInfo_ParameterFlags_kIsList) != 0;
   out->readonly = (info.flags & Steinberg_Vst_ParameterInfo_ParameterFlags_kIsReadOnly) != 0;
   out->bypass = (info.flags & Steinberg_Vst_ParameterInfo_ParameterFlags_kIsBypass) != 0;
   return true;
}

// ------------------------------------------------------------------ processing

static Changes changes;
static Events  events;
static int64_t steady = 0;

static void begin(void) {
   steady = 0;
   // There is no reset() in VST3. Switching the plugin off and on again is the
   // supported way to clear a tail, and it is what stops one render's reverb
   // turning up at the start of the next.
   if (op.comp && op.active) {
      if (op.processing) op.proc->lpVtbl->setProcessing(op.proc, 0);
      op.comp->lpVtbl->setActive(op.comp, 0);
      op.comp->lpVtbl->setActive(op.comp, 1);
      op.proc->lpVtbl->setProcessing(op.proc, 1);
      op.processing = true;
   }
}
static void end(void) {}

static bool process(const Evt *ev, uint32_t nev, float **in, float **out, uint32_t frames) {
   if (!op.proc) return false;

   changes.base.lpVtbl = &changes_vtbl;
   changes.count = 0;
   events.base.lpVtbl = &events_vtbl;
   events.count = 0;

   for (uint32_t i = 0; i < nev; i++) {
      if (ev[i].kind == EVT_PARAM) {
         Steinberg_Vst_ParamID id = ev[i].param_id;
         Steinberg_int32       idx = 0;
         struct Steinberg_Vst_IParamValueQueue *q =
            c_add(&changes, &id, &idx);
         if (q) q->lpVtbl->addPoint(q, (Steinberg_int32)ev[i].time, ev[i].value, &idx);
         // Keep the editor's idea of the value in step, so the text the page
         // shows next time it asks is the text for what it actually heard.
         if (op.ctrl) op.ctrl->lpVtbl->setParamNormalized(op.ctrl, id, ev[i].value);
      } else if (events.count < MAXEVENTS) {
         struct Steinberg_Vst_Event *e = &events.ev[events.count++];
         memset(e, 0, sizeof *e);
         e->busIndex = 0;
         e->sampleOffset = (Steinberg_int32)ev[i].time;
         e->flags = 0;
         if (ev[i].kind == EVT_NOTE_ON) {
            e->type = Steinberg_Vst_Event_EventTypes_kNoteOnEvent;
            e->Steinberg_Vst_Event_noteOn.channel = ev[i].channel;
            e->Steinberg_Vst_Event_noteOn.pitch = ev[i].key;
            e->Steinberg_Vst_Event_noteOn.velocity = (float)ev[i].value;
            e->Steinberg_Vst_Event_noteOn.noteId = ev[i].note_id;
            e->Steinberg_Vst_Event_noteOn.length = 0;
         } else {
            e->type = Steinberg_Vst_Event_EventTypes_kNoteOffEvent;
            e->Steinberg_Vst_Event_noteOff.channel = ev[i].channel;
            e->Steinberg_Vst_Event_noteOff.pitch = ev[i].key;
            e->Steinberg_Vst_Event_noteOff.velocity = 0.f;
            e->Steinberg_Vst_Event_noteOff.noteId = ev[i].note_id;
         }
      }
   }

   // Bus 0 carries the caller's audio; every other bus gets its own silence, so
   // a plugin with a sidechain reads zeroes rather than whatever was in memory.
   for (int b = 0; b < op.n_in_bus; b++)
      for (uint32_t c = 0; c < op.in_bus[b]; c++) {
         if (b == 0 && in && c < in_channels()) {
            bus_ptr[0][b][c] = in[c];
         } else {
            memset(bus_mem[0][b][c], 0, frames * sizeof(float));
            bus_ptr[0][b][c] = bus_mem[0][b][c];
         }
      }
   for (int b = 0; b < op.n_out_bus; b++)
      for (uint32_t c = 0; c < op.out_bus[b]; c++)
         bus_ptr[1][b][c] = (b == 0 && c < out_channels()) ? out[c] : bus_mem[1][b][c];

   struct Steinberg_Vst_ProcessData data;
   memset(&data, 0, sizeof data);
   data.processMode = Steinberg_Vst_ProcessModes_kOffline;
   data.symbolicSampleSize = Steinberg_Vst_SymbolicSampleSizes_kSample32;
   data.numSamples = (Steinberg_int32)frames;
   data.numInputs = op.n_in_bus;
   data.numOutputs = op.n_out_bus;
   data.inputs = op.n_in_bus ? abb[0] : NULL;
   data.outputs = abb[1];
   data.inputParameterChanges = (struct Steinberg_Vst_IParameterChanges *)&changes;
   data.outputParameterChanges = NULL;
   data.inputEvents = events.count ? (struct Steinberg_Vst_IEventList *)&events : NULL;
   data.outputEvents = NULL;
   data.processContext = NULL;

   for (int d = 0; d < 2; d++) {
      int nb = d == 0 ? op.n_in_bus : op.n_out_bus;
      for (int b = 0; b < nb; b++) abb[d][b].silenceFlags = 0;
   }

   steady += frames;
   return op.proc->lpVtbl->process(op.proc, &data) == Steinberg_kResultOk;
}

const Backend vst3_backend = {
   .name = "vst3",
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
