// A VST3 plugin that exists to be measured, not listened to — the companion to
// test/gainplug.c, computing the same thing so the same assertions apply:
//
//     out = in[n - 64] * gain + offset
//
// and declaring those 64 frames through getLatencySamples(). A correct host
// therefore hands back the input bit for bit at unity.
//
// VST3 parameters are always normalised to 0..1, so the mapping is chosen to
// keep the test exact: gain = norm * 4 (so 0.25 is unity, 0.5 is double) and
// offset = norm * 2 - 1 (so 0.5 is none, 0.625 is +0.25). Every one of those is
// exact in binary, which is what lets the suite demand equality.
//
// It publishes TWO effects on purpose:
//
//   Gainvst        one object that is its own edit controller
//   Gainvst Split  a component that names a SEPARATE controller class
//
// Hosts have to handle both, and the split arrangement — which is how most
// commercial plugins are built — is the path more likely to be got wrong, so it
// would be poor practice to test only the easy one.
//
// Implementing COM in C is the usual trick: one struct holding several vtable
// pointers, with each method recovering the object from the address of the
// vtable pointer it was called through.

#include <stdbool.h>
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "vst3_c_api.h"

#define EXPORT __attribute__((visibility("default")))
#define LATENCY 64
#define MAXCH 2

enum { P_GAIN = 0, P_OFFSET = 1, P_COUNT = 2 };

static const Steinberg_TUID CID_SIMPLE =
   SMTG_INLINE_UID(0x4C554331, 0x44474149, 0x4E534D50, 0x4C450001);
static const Steinberg_TUID CID_SPLIT =
   SMTG_INLINE_UID(0x4C554332, 0x44474149, 0x4E535052, 0x4C495400);
static const Steinberg_TUID CID_SPLIT_CTRL =
   SMTG_INLINE_UID(0x4C554333, 0x44474149, 0x4E435452, 0x4C520000);

static void ascii16(Steinberg_char16 *dst, const char *src) {
   int i = 0;
   for (; src[i] && i < 127; i++) dst[i] = (Steinberg_char16)src[i];
   dst[i] = 0;
}
static bool same(const Steinberg_TUID a, const Steinberg_TUID b) { return !memcmp(a, b, 16); }

// --------------------------------------------------------------- shared state

typedef struct {
   double gain, offset;
} Values;

static void defaults(Values *v) {
   v->gain = 0.25;   // normalised; unity
   v->offset = 0.5;  // normalised; none
}

static bool param_info(Steinberg_int32 idx, struct Steinberg_Vst_ParameterInfo *out) {
   memset(out, 0, sizeof *out);
   if (idx == P_GAIN) {
      out->id = P_GAIN;
      ascii16(out->title, "Gain");
      ascii16(out->shortTitle, "Gain");
      ascii16(out->units, "x");
      out->stepCount = 0;
      out->defaultNormalizedValue = 0.25;
      out->flags = Steinberg_Vst_ParameterInfo_ParameterFlags_kCanAutomate;
      return true;
   }
   if (idx == P_OFFSET) {
      out->id = P_OFFSET;
      ascii16(out->title, "Offset");
      ascii16(out->shortTitle, "Ofs");
      ascii16(out->units, "");
      out->stepCount = 0;
      out->defaultNormalizedValue = 0.5;
      out->flags = Steinberg_Vst_ParameterInfo_ParameterFlags_kCanAutomate;
      return true;
   }
   return false;
}

static void param_text(Steinberg_Vst_ParamID id, double norm, Steinberg_Vst_String128 out) {
   char buf[64];
   if (id == P_GAIN)
      snprintf(buf, sizeof buf, "%.2f x", norm * 4.0);
   else
      snprintf(buf, sizeof buf, "%+.3f", norm * 2.0 - 1.0);
   ascii16(out, buf);
}

// ------------------------------------------------------------- the controller

// Used both as the tear-off inside a single-component effect and as the whole
// of the standalone controller class.
typedef struct Ctrl {
   struct Steinberg_Vst_IEditControllerVtbl *vtbl;
   Steinberg_uint32                          refs;
   Values                                   *v;
   Values                                    own;  // only for the standalone one
} Ctrl;

static Steinberg_tresult SMTG_STDMETHODCALLTYPE ctrl_qi(void *me, const Steinberg_TUID iid,
                                                        void **obj);

static Steinberg_uint32 SMTG_STDMETHODCALLTYPE ctrl_addref(void *me) {
   return ++((Ctrl *)me)->refs;
}
static Steinberg_uint32 SMTG_STDMETHODCALLTYPE ctrl_release(void *me) {
   Ctrl *c = me;
   if (--c->refs == 0 && c->v == &c->own) {
      free(c);
      return 0;
   }
   return c->refs;
}
static Steinberg_tresult SMTG_STDMETHODCALLTYPE ctrl_init(void *me,
                                                          struct Steinberg_FUnknown *ctx) {
   return Steinberg_kResultOk;
}
static Steinberg_tresult SMTG_STDMETHODCALLTYPE ctrl_term(void *me) { return Steinberg_kResultOk; }
static Steinberg_tresult SMTG_STDMETHODCALLTYPE ctrl_setcomp(void *me,
                                                             struct Steinberg_IBStream *s) {
   return Steinberg_kResultOk;
}
static Steinberg_tresult SMTG_STDMETHODCALLTYPE ctrl_setstate(void *me,
                                                              struct Steinberg_IBStream *s) {
   return Steinberg_kResultOk;
}
static Steinberg_tresult SMTG_STDMETHODCALLTYPE ctrl_getstate(void *me,
                                                              struct Steinberg_IBStream *s) {
   return Steinberg_kResultOk;
}
static Steinberg_int32 SMTG_STDMETHODCALLTYPE ctrl_count(void *me) { return P_COUNT; }
static Steinberg_tresult SMTG_STDMETHODCALLTYPE
ctrl_info(void *me, Steinberg_int32 idx, struct Steinberg_Vst_ParameterInfo *out) {
   return param_info(idx, out) ? Steinberg_kResultOk : Steinberg_kResultFalse;
}
static Steinberg_tresult SMTG_STDMETHODCALLTYPE ctrl_tostring(void *me, Steinberg_Vst_ParamID id,
                                                              Steinberg_Vst_ParamValue v,
                                                              Steinberg_Vst_String128 out) {
   param_text(id, v, out);
   return Steinberg_kResultOk;
}
static Steinberg_tresult SMTG_STDMETHODCALLTYPE ctrl_fromstring(void *me, Steinberg_Vst_ParamID id,
                                                                Steinberg_Vst_TChar *str,
                                                                Steinberg_Vst_ParamValue *out) {
   return Steinberg_kResultFalse;
}
static Steinberg_Vst_ParamValue SMTG_STDMETHODCALLTYPE ctrl_toplain(void *me,
                                                                    Steinberg_Vst_ParamID id,
                                                                    Steinberg_Vst_ParamValue v) {
   return id == P_GAIN ? v * 4.0 : v * 2.0 - 1.0;
}
static Steinberg_Vst_ParamValue SMTG_STDMETHODCALLTYPE ctrl_tonorm(void *me,
                                                                   Steinberg_Vst_ParamID id,
                                                                   Steinberg_Vst_ParamValue v) {
   return id == P_GAIN ? v / 4.0 : (v + 1.0) / 2.0;
}
static Steinberg_Vst_ParamValue SMTG_STDMETHODCALLTYPE ctrl_get(void *me,
                                                                Steinberg_Vst_ParamID id) {
   Ctrl *c = me;
   return id == P_GAIN ? c->v->gain : c->v->offset;
}
static Steinberg_tresult SMTG_STDMETHODCALLTYPE ctrl_set(void *me, Steinberg_Vst_ParamID id,
                                                         Steinberg_Vst_ParamValue v) {
   Ctrl *c = me;
   if (id == P_GAIN) c->v->gain = v;
   else if (id == P_OFFSET) c->v->offset = v;
   else return Steinberg_kResultFalse;
   return Steinberg_kResultOk;
}
static Steinberg_tresult SMTG_STDMETHODCALLTYPE
ctrl_handler(void *me, struct Steinberg_Vst_IComponentHandler *h) {
   return Steinberg_kResultOk;
}
static struct Steinberg_IPlugView *SMTG_STDMETHODCALLTYPE ctrl_view(void *me,
                                                                    Steinberg_FIDString name) {
   return NULL;
}

static struct Steinberg_Vst_IEditControllerVtbl ctrl_vtbl = {
   ctrl_qi,      ctrl_addref,  ctrl_release,   ctrl_init,    ctrl_term,     ctrl_setcomp,
   ctrl_setstate, ctrl_getstate, ctrl_count,   ctrl_info,    ctrl_tostring, ctrl_fromstring,
   ctrl_toplain, ctrl_tonorm,  ctrl_get,       ctrl_set,     ctrl_handler,  ctrl_view};

static Steinberg_tresult SMTG_STDMETHODCALLTYPE ctrl_qi(void *me, const Steinberg_TUID iid,
                                                        void **obj) {
   if (same(iid, Steinberg_Vst_IEditController_iid) || same(iid, Steinberg_IPluginBase_iid) ||
       same(iid, Steinberg_FUnknown_iid)) {
      *obj = me;
      ctrl_addref(me);
      return Steinberg_kResultOk;
   }
   *obj = NULL;
   return Steinberg_kNoInterface;
}

// ------------------------------------------------------------- the component

typedef struct {
   struct Steinberg_Vst_IComponentVtbl      *compVtbl;
   struct Steinberg_Vst_IAudioProcessorVtbl *procVtbl;
   Ctrl                                      ctrl;  // only offered when !split
   Steinberg_uint32                          refs;
   bool                                      split;
   Values                                    v;
   float                                     delay[MAXCH][LATENCY];
   Steinberg_int32                           pos;
} Comp;

#define FROM_PROC(me) ((Comp *)((char *)(me) - offsetof(Comp, procVtbl)))
#define FROM_CTRL(me) ((Comp *)((char *)(me) - offsetof(Comp, ctrl)))

static Steinberg_tresult SMTG_STDMETHODCALLTYPE comp_qi(void *me, const Steinberg_TUID iid,
                                                        void **obj);

static Steinberg_uint32 SMTG_STDMETHODCALLTYPE comp_addref(void *me) { return ++((Comp *)me)->refs; }
static Steinberg_uint32 SMTG_STDMETHODCALLTYPE comp_release(void *me) {
   Comp *c = me;
   if (--c->refs == 0) {
      free(c);
      return 0;
   }
   return c->refs;
}
static Steinberg_tresult SMTG_STDMETHODCALLTYPE comp_init(void *me,
                                                          struct Steinberg_FUnknown *ctx) {
   return Steinberg_kResultOk;
}
static Steinberg_tresult SMTG_STDMETHODCALLTYPE comp_term(void *me) { return Steinberg_kResultOk; }
static Steinberg_tresult SMTG_STDMETHODCALLTYPE comp_ctrlid(void *me, Steinberg_TUID out) {
   Comp *c = me;
   if (!c->split) return Steinberg_kResultFalse;
   memcpy(out, CID_SPLIT_CTRL, 16);
   return Steinberg_kResultOk;
}
static Steinberg_tresult SMTG_STDMETHODCALLTYPE comp_iomode(void *me, Steinberg_Vst_IoMode m) {
   return Steinberg_kResultOk;
}
static Steinberg_int32 SMTG_STDMETHODCALLTYPE comp_buscount(void *me, Steinberg_Vst_MediaType t,
                                                            Steinberg_Vst_BusDirection d) {
   return t == Steinberg_Vst_MediaTypes_kAudio ? 1 : 0;
}
static Steinberg_tresult SMTG_STDMETHODCALLTYPE comp_businfo(void *me, Steinberg_Vst_MediaType t,
                                                             Steinberg_Vst_BusDirection d,
                                                             Steinberg_int32 i,
                                                             struct Steinberg_Vst_BusInfo *out) {
   if (t != Steinberg_Vst_MediaTypes_kAudio || i != 0) return Steinberg_kResultFalse;
   memset(out, 0, sizeof *out);
   out->mediaType = t;
   out->direction = d;
   out->channelCount = MAXCH;
   ascii16(out->name, d == Steinberg_Vst_BusDirections_kInput ? "In" : "Out");
   out->busType = Steinberg_Vst_BusTypes_kMain;
   out->flags = Steinberg_Vst_BusInfo_BusFlags_kDefaultActive;
   return Steinberg_kResultOk;
}
static Steinberg_tresult SMTG_STDMETHODCALLTYPE comp_routing(void *me,
                                                             struct Steinberg_Vst_RoutingInfo *a,
                                                             struct Steinberg_Vst_RoutingInfo *b) {
   return Steinberg_kResultFalse;
}
static Steinberg_tresult SMTG_STDMETHODCALLTYPE comp_activatebus(void *me, Steinberg_Vst_MediaType t,
                                                                 Steinberg_Vst_BusDirection d,
                                                                 Steinberg_int32 i,
                                                                 Steinberg_TBool on) {
   return Steinberg_kResultOk;
}
static Steinberg_tresult SMTG_STDMETHODCALLTYPE comp_setactive(void *me, Steinberg_TBool on) {
   Comp *c = me;
   // Going inactive and back is how a VST3 host clears a tail, so this must
   // actually clear it — the host's test for that depends on it.
   memset(c->delay, 0, sizeof c->delay);
   c->pos = 0;
   return Steinberg_kResultOk;
}
static Steinberg_tresult SMTG_STDMETHODCALLTYPE comp_setstate(void *me,
                                                              struct Steinberg_IBStream *s) {
   return Steinberg_kResultOk;
}
static Steinberg_tresult SMTG_STDMETHODCALLTYPE comp_getstate(void *me,
                                                              struct Steinberg_IBStream *s) {
   return Steinberg_kResultOk;
}

static struct Steinberg_Vst_IComponentVtbl comp_vtbl = {
   comp_qi,       comp_addref,  comp_release,    comp_init,     comp_term,
   comp_ctrlid,   comp_iomode,  comp_buscount,   comp_businfo,  comp_routing,
   comp_activatebus, comp_setactive, comp_setstate, comp_getstate};

// ------------------------------------------------------------ audio processor

static Steinberg_tresult SMTG_STDMETHODCALLTYPE proc_qi(void *me, const Steinberg_TUID iid,
                                                        void **obj) {
   return comp_qi(FROM_PROC(me), iid, obj);
}
static Steinberg_uint32 SMTG_STDMETHODCALLTYPE proc_addref(void *me) {
   return comp_addref(FROM_PROC(me));
}
static Steinberg_uint32 SMTG_STDMETHODCALLTYPE proc_release(void *me) {
   return comp_release(FROM_PROC(me));
}
static Steinberg_tresult SMTG_STDMETHODCALLTYPE proc_arrangements(void *me,
                                                                  Steinberg_Vst_SpeakerArrangement *in,
                                                                  Steinberg_int32 nin,
                                                                  Steinberg_Vst_SpeakerArrangement *out,
                                                                  Steinberg_int32 nout) {
   return Steinberg_kResultOk;
}
static Steinberg_tresult SMTG_STDMETHODCALLTYPE proc_getarrangement(void *me,
                                                                    Steinberg_Vst_BusDirection d,
                                                                    Steinberg_int32 i,
                                                                    Steinberg_Vst_SpeakerArrangement *a) {
   *a = 3;  // kSpeakerL | kSpeakerR
   return Steinberg_kResultOk;
}
static Steinberg_tresult SMTG_STDMETHODCALLTYPE proc_cansize(void *me, Steinberg_int32 size) {
   return size == Steinberg_Vst_SymbolicSampleSizes_kSample32 ? Steinberg_kResultTrue
                                                              : Steinberg_kResultFalse;
}
static Steinberg_uint32 SMTG_STDMETHODCALLTYPE proc_latency(void *me) { return LATENCY; }
static Steinberg_tresult SMTG_STDMETHODCALLTYPE proc_setup(void *me,
                                                           struct Steinberg_Vst_ProcessSetup *s) {
   return s->symbolicSampleSize == Steinberg_Vst_SymbolicSampleSizes_kSample32
             ? Steinberg_kResultOk
             : Steinberg_kResultFalse;
}
static Steinberg_tresult SMTG_STDMETHODCALLTYPE proc_setprocessing(void *me, Steinberg_TBool on) {
   return Steinberg_kResultOk;
}
static Steinberg_uint32 SMTG_STDMETHODCALLTYPE proc_tail(void *me) { return LATENCY; }

static Steinberg_tresult SMTG_STDMETHODCALLTYPE proc_process(void *me,
                                                             struct Steinberg_Vst_ProcessData *d) {
   Comp *c = FROM_PROC(me);

   // Whole-block parameter application: exactness beats nuance in a test fixture.
   if (d->inputParameterChanges) {
      struct Steinberg_Vst_IParameterChanges *pc = d->inputParameterChanges;
      Steinberg_int32 n = pc->lpVtbl->getParameterCount(pc);
      for (Steinberg_int32 i = 0; i < n; i++) {
         struct Steinberg_Vst_IParamValueQueue *q = pc->lpVtbl->getParameterData(pc, i);
         if (!q) continue;
         Steinberg_int32 points = q->lpVtbl->getPointCount(q);
         if (points <= 0) continue;
         Steinberg_int32          off = 0;
         Steinberg_Vst_ParamValue val = 0;
         if (q->lpVtbl->getPoint(q, points - 1, &off, &val) != Steinberg_kResultOk) continue;
         Steinberg_Vst_ParamID id = q->lpVtbl->getParameterId(q);
         if (id == P_GAIN) c->v.gain = val;
         else if (id == P_OFFSET) c->v.offset = val;
      }
   }

   if (!d->outputs || !d->outputs[0].Steinberg_Vst_AudioBusBuffers_channelBuffers32)
      return Steinberg_kResultFalse;

   double   gain = c->v.gain * 4.0;
   double   offset = c->v.offset * 2.0 - 1.0;
   Steinberg_int32 frames = d->numSamples;
   Steinberg_int32 outch = d->outputs[0].numChannels;
   Steinberg_int32 inch =
      (d->numInputs > 0 && d->inputs[0].Steinberg_Vst_AudioBusBuffers_channelBuffers32)
         ? d->inputs[0].numChannels
         : 0;

   for (Steinberg_int32 i = 0; i < frames; i++) {
      Steinberg_int32 slot = (c->pos + i) % LATENCY;
      for (Steinberg_int32 ch = 0; ch < outch && ch < MAXCH; ch++) {
         float fresh = ch < inch
                          ? d->inputs[0].Steinberg_Vst_AudioBusBuffers_channelBuffers32[ch][i]
                          : 0.f;
         float aged = c->delay[ch][slot];
         c->delay[ch][slot] = fresh;
         d->outputs[0].Steinberg_Vst_AudioBusBuffers_channelBuffers32[ch][i] =
            (float)(aged * gain + offset);
      }
   }
   c->pos = (c->pos + frames) % LATENCY;
   return Steinberg_kResultOk;
}

static struct Steinberg_Vst_IAudioProcessorVtbl proc_vtbl = {
   proc_qi,      proc_addref,   proc_release, proc_arrangements, proc_getarrangement,
   proc_cansize, proc_latency,  proc_setup,   proc_setprocessing, proc_process,
   proc_tail};

static Steinberg_tresult SMTG_STDMETHODCALLTYPE comp_qi(void *me, const Steinberg_TUID iid,
                                                        void **obj) {
   Comp *c = me;
   if (same(iid, Steinberg_Vst_IComponent_iid) || same(iid, Steinberg_IPluginBase_iid) ||
       same(iid, Steinberg_FUnknown_iid)) {
      *obj = &c->compVtbl;
      comp_addref(c);
      return Steinberg_kResultOk;
   }
   if (same(iid, Steinberg_Vst_IAudioProcessor_iid)) {
      *obj = &c->procVtbl;
      comp_addref(c);
      return Steinberg_kResultOk;
   }
   // The split variant deliberately refuses, so the host has to go and fetch the
   // separate controller class the way it would for a real commercial plugin.
   if (same(iid, Steinberg_Vst_IEditController_iid) && !c->split) {
      *obj = &c->ctrl;
      comp_addref(c);
      return Steinberg_kResultOk;
   }
   *obj = NULL;
   return Steinberg_kNoInterface;
}

// ------------------------------------------------------------------ factory

static Comp *make_comp(bool split) {
   Comp *c = calloc(1, sizeof *c);
   if (!c) return NULL;
   c->compVtbl = &comp_vtbl;
   c->procVtbl = &proc_vtbl;
   c->ctrl.vtbl = &ctrl_vtbl;
   c->ctrl.v = &c->v;
   c->refs = 1;
   c->split = split;
   defaults(&c->v);
   return c;
}

typedef struct {
   const Steinberg_TUID *cid;
   const char           *name;
   const char           *subcats;
} ClassRow;

static const ClassRow classes[] = {
   {&CID_SIMPLE, "Gainvst", "Fx|Tools"},
   {&CID_SPLIT, "Gainvst Split", "Fx|Tools"},
};
#define NCLASSES ((Steinberg_int32)(sizeof classes / sizeof *classes))

static Steinberg_tresult SMTG_STDMETHODCALLTYPE fac_qi(void *me, const Steinberg_TUID iid,
                                                       void **obj) {
   if (same(iid, Steinberg_IPluginFactory_iid) || same(iid, Steinberg_IPluginFactory2_iid) ||
       same(iid, Steinberg_FUnknown_iid)) {
      *obj = me;
      return Steinberg_kResultOk;
   }
   *obj = NULL;
   return Steinberg_kNoInterface;
}
static Steinberg_uint32 SMTG_STDMETHODCALLTYPE fac_ref(void *me) { return 1; }

static Steinberg_tresult SMTG_STDMETHODCALLTYPE fac_info(void *me,
                                                         struct Steinberg_PFactoryInfo *out) {
   memset(out, 0, sizeof *out);
   snprintf(out->vendor, sizeof out->vendor, "lucidsoup");
   snprintf(out->url, sizeof out->url, "https://www.lucidsoup.com");
   return Steinberg_kResultOk;
}
static Steinberg_int32 SMTG_STDMETHODCALLTYPE fac_count(void *me) { return NCLASSES; }

static Steinberg_tresult SMTG_STDMETHODCALLTYPE fac_class(void *me, Steinberg_int32 i,
                                                          struct Steinberg_PClassInfo *out) {
   if (i < 0 || i >= NCLASSES) return Steinberg_kResultFalse;
   memset(out, 0, sizeof *out);
   memcpy(out->cid, *classes[i].cid, 16);
   out->cardinality = Steinberg_PClassInfo_ClassCardinality_kManyInstances;
   snprintf(out->category, sizeof out->category, "Audio Module Class");
   snprintf(out->name, sizeof out->name, "%s", classes[i].name);
   return Steinberg_kResultOk;
}
static Steinberg_tresult SMTG_STDMETHODCALLTYPE fac_class2(void *me, Steinberg_int32 i,
                                                           struct Steinberg_PClassInfo2 *out) {
   if (i < 0 || i >= NCLASSES) return Steinberg_kResultFalse;
   memset(out, 0, sizeof *out);
   memcpy(out->cid, *classes[i].cid, 16);
   out->cardinality = Steinberg_PClassInfo_ClassCardinality_kManyInstances;
   snprintf(out->category, sizeof out->category, "Audio Module Class");
   snprintf(out->name, sizeof out->name, "%s", classes[i].name);
   snprintf(out->subCategories, sizeof out->subCategories, "%s", classes[i].subcats);
   snprintf(out->vendor, sizeof out->vendor, "lucidsoup");
   snprintf(out->version, sizeof out->version, "1.0.0");
   snprintf(out->sdkVersion, sizeof out->sdkVersion, "VST 3.7.0");
   return Steinberg_kResultOk;
}

static Steinberg_tresult SMTG_STDMETHODCALLTYPE fac_create(void *me, Steinberg_FIDString cid,
                                                           Steinberg_FIDString iid, void **obj) {
   *obj = NULL;
   if (same((const char *)cid, CID_SPLIT_CTRL)) {
      Ctrl *c = calloc(1, sizeof *c);
      if (!c) return Steinberg_kResultFalse;
      c->vtbl = &ctrl_vtbl;
      c->v = &c->own;
      c->refs = 1;
      defaults(&c->own);
      return ctrl_qi(c, (const char *)iid, obj) == Steinberg_kResultOk
                ? (ctrl_release(c), Steinberg_kResultOk)
                : (free(c), Steinberg_kNoInterface);
   }
   bool split = same((const char *)cid, CID_SPLIT);
   if (!split && !same((const char *)cid, CID_SIMPLE)) return Steinberg_kResultFalse;
   Comp *c = make_comp(split);
   if (!c) return Steinberg_kResultFalse;
   Steinberg_tresult r = comp_qi(c, (const char *)iid, obj);
   comp_release(c);  // queryInterface took its own reference
   return r;
}

static struct Steinberg_IPluginFactory2Vtbl factory_vtbl = {
   fac_qi, fac_ref, fac_ref, fac_info, fac_count, fac_class, fac_create, fac_class2};

static struct Steinberg_IPluginFactory2 the_factory = {&factory_vtbl};

// -------------------------------------------------------------------- entry

EXPORT bool ModuleEntry(void *handle) { return true; }
EXPORT bool ModuleExit(void) { return true; }
EXPORT bool bundleEntry(void *handle) { return true; }
EXPORT bool bundleExit(void) { return true; }

EXPORT struct Steinberg_IPluginFactory *GetPluginFactory(void) {
   return (struct Steinberg_IPluginFactory *)&the_factory;
}
