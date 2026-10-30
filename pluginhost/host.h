// What host.c and the plugin-format backends agree on.
//
// There are two formats here and they have nothing in common at the ABI level:
// CLAP is plain C with an event list, VST3 is a COM-like vtable affair with
// parameter queues. What they do have in common is everything that is actually
// hard — the preroll, the latency compensation, the block splitting, the
// channel mapping — and none of that should exist twice.
//
// So the shared code owns the buffers and the clock, and a backend only has to
// answer: what did you find, what are your parameters, and here is a block of
// audio and some events, please fill in the output.

#ifndef PLUGINHOST_H
#define PLUGINHOST_H

#include <stdarg.h>
#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>

// Rendering happens in blocks like any host, so a plugin sees the buffer sizes
// it expects rather than one enormous one it may refuse to allocate for.
#define BLOCK 512
// Silence fed in before the real audio, so a plugin's parameter smoothing and
// its filters settle on the values we just set instead of gliding to them
// audibly over the first few milliseconds. Discarded afterwards.
#define PREROLL 4096

// ---------------------------------------------------------------- small stuff

void  say(const char *fmt, ...);
void *xmalloc(size_t n);
char *xstrdup(const char *s);
bool  is_dir(const char *p);
bool  is_file(const char *p);
bool  ends_with(const char *s, const char *suf);

typedef struct {
   char  *s;
   size_t len, cap;
} Buf;

void buf_add(Buf *b, const char *s, size_t n);
void buf_str(Buf *b, const char *s);
void buf_fmt(Buf *b, const char *fmt, ...);
void buf_json(Buf *b, const char *s);

extern int verbose;

// --------------------------------------------------------------- what a scan finds

typedef struct {
   char *bundle;   // what the user calls it: /…/Thing.clap or /…/Thing.vst3
   char *dso;      // what dlopen wants, which inside a bundle is deeper
   char *id;       // unique within this host: the backend prefixes its own name
   char *name, *vendor, *version, *descr, *features;
   const struct Backend *be;
} Found;

void found_push(Found f);

// ------------------------------------------------------------------ parameters

#define PNAME 128

typedef struct {
   uint32_t id;
   char     name[PNAME];
   char     module[PNAME];
   char     text[PNAME];     // the plugin's own rendering of the current value
   double   min, max, def, value;
   bool     stepped, is_enum, readonly, bypass;
} ParamInfo;

// ---------------------------------------------------------------------- events

enum { EVT_PARAM = 0, EVT_NOTE_ON = 1, EVT_NOTE_OFF = 2 };

typedef struct {
   int      kind;
   uint32_t time;      // frames into the block it is handed to
   uint32_t param_id;
   double   value;     // the parameter's value, or the note's velocity
   int16_t  key, channel;
   int32_t  note_id;
} Evt;

// ------------------------------------------------------------- what a render asks

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
   const char  *id;
   uint32_t     rate, channels, frames;
   ParamSet    *params;
   uint32_t     nparams;
   NoteHit     *notes;
   uint32_t     nnotes;
   const float *in;  // planar: channels * frames, NULL for an instrument
} Req;

typedef struct {
   float   *data;  // planar: channels * frames
   uint32_t channels, frames;
   int      status;
} Res;

// ----------------------------------------------------------------- the backend

typedef struct Backend {
   const char *name;  // "clap" or "vst3"; also the prefix on every id it mints

   // Does this directory entry belong to me? (".clap", ".vst3")
   bool (*claims)(const char *path);
   // Fill out[] with up to max malloc'd default search directories for this
   // format, including whatever its own environment variable names. Each
   // format looks somewhere different, and host.c should not have to know
   // where.
   int (*dirs)(char **out, int max);
   // Open it, call found_push for each plugin inside, close it again.
   void (*scan)(const char *bundle, const struct Backend *self);

   // Open and activate. NULL on success, else a sentence for the page.
   // The same id and rate twice in a row should be a no-op: turning a knob
   // re-renders, and reloading a sampler for each turn would be unusable.
   const char *(*load)(const Found *f, double rate);
   void (*unload)(void);

   uint32_t (*in_channels)(void);
   uint32_t (*out_channels)(void);
   uint32_t (*latency)(void);

   uint32_t (*param_count)(void);
   bool (*param_at)(uint32_t index, ParamInfo *out);

   // Start of a render, after load and before any block.
   void (*begin)(void);
   // One block. in may be NULL. Both are planar, in the plugin's own channel
   // counts. Event times are already relative to this block. Returns false if
   // the plugin reported an error.
   bool (*process)(const Evt *ev, uint32_t nev, float **in, float **out, uint32_t frames);
   void (*end)(void);

   // Anything the plugin said for itself while it was being loaded, or "".
   const char *(*complaint)(void);
} Backend;

extern const Backend clap_backend;
extern const Backend vst3_backend;

#endif
