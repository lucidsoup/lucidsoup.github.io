// pluginhost — your own CLAP and VST3 plugins, played in a browser.
//
// A browser cannot load a .clap, a .vst3 or a .component. Those are native
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
// This file owns the parts that are the same whatever format a plugin is in:
// the HTTP, the preroll, the latency compensation, the block splitting and the
// channel mapping. clap_backend.c and vst3_backend.c own the rest.
//
// Build: make        (fetches the MIT CLAP and BSD VST3 headers, then builds)
// Run:   ./pluginhost

#define _GNU_SOURCE
#include <ctype.h>
#include <dirent.h>
#include <errno.h>
#include <math.h>
#include <stdarg.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>
#include <unistd.h>

#include <arpa/inet.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <sys/socket.h>
#include <sys/stat.h>

#include "host.h"

#define MAX_BODY (384u * 1024u * 1024u)
#define MAX_FRAMES (48000u * 60u * 12u)

int verbose = 0;

void say(const char *fmt, ...) {
   va_list ap;
   va_start(ap, fmt);
   vfprintf(stderr, fmt, ap);
   va_end(ap);
   fputc('\n', stderr);
}

void *xmalloc(size_t n) {
   void *p = malloc(n ? n : 1);
   if (!p) {
      say("out of memory");
      exit(1);
   }
   return p;
}
char *xstrdup(const char *s) {
   if (!s) s = "";
   size_t n = strlen(s) + 1;
   char  *p = xmalloc(n);
   memcpy(p, s, n);
   return p;
}
bool is_dir(const char *p) {
   struct stat st;
   return stat(p, &st) == 0 && S_ISDIR(st.st_mode);
}
bool is_file(const char *p) {
   struct stat st;
   return stat(p, &st) == 0 && S_ISREG(st.st_mode);
}
bool ends_with(const char *s, const char *suf) {
   size_t a = strlen(s), b = strlen(suf);
   return a >= b && !strcmp(s + a - b, suf);
}

// ---------------------------------------------------------------- growable text

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
void buf_add(Buf *b, const char *s, size_t n) {
   buf_need(b, n);
   memcpy(b->s + b->len, s, n);
   b->len += n;
   b->s[b->len] = 0;
}
void buf_str(Buf *b, const char *s) { buf_add(b, s, strlen(s)); }
void buf_fmt(Buf *b, const char *fmt, ...) {
   char    tmp[1024];
   va_list ap;
   va_start(ap, fmt);
   int n = vsnprintf(tmp, sizeof tmp, fmt, ap);
   va_end(ap);
   if (n > 0) buf_add(b, tmp, (size_t)n < sizeof tmp ? (size_t)n : sizeof tmp - 1);
}
// A JSON string. Control characters have to go somewhere, and \u00xx is the only
// escape that is always legal, so everything below a space takes that route.
void buf_json(Buf *b, const char *s) {
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

// ------------------------------------------------------------------- the scan

static const Backend *backends[] = {&clap_backend, &vst3_backend};
#define NBACKENDS ((int)(sizeof backends / sizeof *backends))

static Found *found = NULL;
static int    nfound = 0, cfound = 0;

void found_push(Found f) {
   if (nfound == cfound) {
      cfound = cfound ? cfound * 2 : 16;
      found = realloc(found, (size_t)cfound * sizeof *found);
      if (!found) exit(1);
   }
   found[nfound++] = f;
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
      const Backend *owner = NULL;
      for (int i = 0; i < NBACKENDS; i++)
         if (backends[i]->claims(e->d_name)) owner = backends[i];
      if (owner)
         owner->scan(p, owner);
      else if (is_dir(p))
         scan_dir(p, depth + 1);
   }
   closedir(d);
}

static void scan_one(const char *path) {
   for (int i = 0; i < NBACKENDS; i++)
      if (backends[i]->claims(path)) {
         backends[i]->scan(path, backends[i]);
         return;
      }
   if (is_dir(path))
      scan_dir(path, 0);
   else
      say("  not a directory, a .clap or a .vst3: %s", path);
}

static void scan_all(char **extra, int nextra) {
   for (int i = 0; i < NBACKENDS; i++) {
      char *dirs[8];
      int   n = backends[i]->dirs(dirs, 8);
      for (int k = 0; k < n; k++) {
         if (is_dir(dirs[k])) scan_dir(dirs[k], 0);
         free(dirs[k]);
      }
   }
   for (int i = 0; i < nextra; i++) scan_one(extra[i]);
}

// ----------------------------------------------------------- the loaded plugin

static const Backend *cur_be = NULL;
static char          *cur_id = NULL;

static Found *find_by_id(const char *id) {
   for (int i = 0; i < nfound; i++)
      if (!strcmp(found[i].id, id)) return &found[i];
   return NULL;
}

// Returns NULL on success, or a sentence for the page to show.
static const char *load(const char *id, double rate) {
   Found *f = find_by_id(id);
   if (!f) return "No plugin with that id was found in the scan.";
   // Two formats, one slot: whatever else was open has to go first, or two
   // plugins would be holding audio buffers that only one render will drive.
   if (cur_be && cur_be != f->be) {
      cur_be->unload();
      free(cur_id);
      cur_id = NULL;
      cur_be = NULL;
   }
   const char *err = f->be->load(f, rate);
   if (err) {
      cur_be = NULL;
      free(cur_id);
      cur_id = NULL;
      return err;
   }
   cur_be = f->be;
   free(cur_id);
   cur_id = xstrdup(id);
   return NULL;
}

static void unload_current(void) {
   if (cur_be) cur_be->unload();
   cur_be = NULL;
   free(cur_id);
   cur_id = NULL;
}

// ------------------------------------------------------------------ rendering

static int evt_cmp(const void *a, const void *b) {
   uint32_t x = ((const Evt *)a)->time, y = ((const Evt *)b)->time;
   return x < y ? -1 : x > y ? 1 : 0;
}

static const char *render(const Req *rq, Res *out) {
   const char *err = load(rq->id, (double)rq->rate);
   if (err) return err;
   const Backend *be = cur_be;

   uint32_t in_ch = be->in_channels(), out_ch = be->out_channels();
   // A plugin with lookahead reports its latency, and its output arrives that
   // many frames late. Two different offsets, and conflating them shifts the
   // whole render by exactly that latency: the caller's audio goes IN after the
   // preroll, but comes OUT the plugin's latency later than that.
   uint32_t lat = be->latency();
   if (lat > rq->rate * 10u) lat = 0;  // a nonsense figure is worse than none
   uint32_t in_off = PREROLL;
   uint32_t out_off = PREROLL + lat;
   uint32_t total = out_off + rq->frames;

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
   memset(out->data, 0, (size_t)out_ch * rq->frames * sizeof(float));

   // --- the whole event list, in absolute frames, sorted
   uint32_t nev = rq->nparams + rq->nnotes * 2;
   Evt     *evs = xmalloc((nev ? nev : 1) * sizeof *evs);
   Evt     *blk = xmalloc((nev ? nev : 1) * sizeof *blk);
   uint32_t n = 0;
   for (uint32_t i = 0; i < rq->nparams; i++) {
      Evt *e = &evs[n++];
      memset(e, 0, sizeof *e);
      e->kind = EVT_PARAM;
      e->time = 0;  // before any audio, so smoothing settles in the preroll
      e->param_id = rq->params[i].id;
      e->value = rq->params[i].value;
   }
   for (uint32_t i = 0; i < rq->nnotes; i++) {
      const NoteHit *h = &rq->notes[i];
      Evt           *on = &evs[n++];
      memset(on, 0, sizeof *on);
      on->kind = EVT_NOTE_ON;
      on->time = in_off + h->start;
      on->key = h->key;
      on->channel = h->channel;
      on->value = h->velocity;
      on->note_id = (int32_t)i;
      Evt *off = &evs[n++];
      *off = *on;
      off->kind = EVT_NOTE_OFF;
      off->time = in_off + h->start + h->length;
      off->value = 0;
   }
   nev = n;
   qsort(evs, nev, sizeof *evs, evt_cmp);

   be->begin();

   bool     okay = true;
   uint32_t cursor = 0;
   for (uint32_t pos = 0; pos < total && okay; pos += BLOCK) {
      uint32_t len = total - pos < BLOCK ? total - pos : BLOCK;

      // Input: silence through the preroll, then the caller's audio, duplicated
      // or dropped as needed to match however many channels the plugin asked for.
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

      uint32_t nblk = 0;
      while (cursor < nev && evs[cursor].time < pos + len) {
         blk[nblk] = evs[cursor];
         blk[nblk].time = evs[cursor].time > pos ? evs[cursor].time - pos : 0;
         nblk++;
         cursor++;
      }

      okay = be->process(blk, nblk, in_ch ? inbuf : NULL, outbuf, len);
      if (!okay) break;

      // Keep only what lines up with the caller's audio.
      for (uint32_t i = 0; i < len; i++) {
         int64_t dst = (int64_t)pos + i - (int64_t)out_off;
         if (dst < 0 || dst >= rq->frames) continue;
         for (uint32_t c = 0; c < out_ch; c++)
            out->data[(size_t)c * rq->frames + (size_t)dst] = outbuf[c][i];
      }
   }
   be->end();
   out->status = okay ? 1 : 0;

   for (uint32_t c = 0; c < in_ch; c++) free(inbuf[c]);
   free(inbuf);
   for (uint32_t c = 0; c < out_ch; c++) free(outbuf[c]);
   free(outbuf);
   free(evs);
   free(blk);

   if (!okay) {
      free(out->data);
      out->data = NULL;
      const char *why = be->complaint();
      return (why && *why) ? why : "The plugin reported an error while processing.";
   }
   return NULL;
}

// ----------------------------------------------------------------- HTTP plumbing

static char token[129];
static int  port = 7777;
static char *page_path = NULL;

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

static void route_plugins(int fd) {
   Buf b = {0};
   buf_fmt(&b, "{\"ok\":true,\"count\":%d,\"plugins\":[", nfound);
   for (int i = 0; i < nfound; i++) {
      if (i) buf_str(&b, ",");
      buf_str(&b, "{\"id\":");
      buf_json(&b, found[i].id);
      buf_str(&b, ",\"format\":");
      buf_json(&b, found[i].be->name);
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
   const Backend *be = cur_be;
   Buf            b = {0};
   buf_fmt(&b, "{\"ok\":true,\"format\":\"%s\",\"inputChannels\":%u,\"outputChannels\":%u,"
               "\"latency\":%u,\"params\":[",
           be->name, be->in_channels(), be->out_channels(), be->latency());
   uint32_t n = be->param_count();
   int      written = 0;
   for (uint32_t i = 0; i < n; i++) {
      ParamInfo p;
      if (!be->param_at(i, &p)) continue;
      if (written++) buf_str(&b, ",");
      buf_fmt(&b, "{\"id\":%u,", (unsigned)p.id);
      buf_str(&b, "\"name\":");
      buf_json(&b, p.name);
      buf_str(&b, ",\"module\":");
      buf_json(&b, p.module);
      // Not finite is not representable in JSON, and a plugin is allowed to be
      // wrong about this; clamping keeps the page from getting a NaN literal.
      buf_fmt(&b, ",\"min\":%.17g,\"max\":%.17g,\"default\":%.17g,\"value\":%.17g",
              isfinite(p.min) ? p.min : 0.0, isfinite(p.max) ? p.max : 1.0,
              isfinite(p.def) ? p.def : 0.0, isfinite(p.value) ? p.value : 0.0);
      buf_fmt(&b, ",\"stepped\":%s", p.stepped ? "true" : "false");
      buf_fmt(&b, ",\"enum\":%s", p.is_enum ? "true" : "false");
      buf_fmt(&b, ",\"readonly\":%s", p.readonly ? "true" : "false");
      buf_fmt(&b, ",\"bypass\":%s", p.bypass ? "true" : "false");
      buf_str(&b, ",\"text\":");
      buf_json(&b, p.text);
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
   Buf    b = {0};
   char   chunk[8192];
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
   char tbuf[160];
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
      int clap_n = 0, vst3_n = 0;
      for (int i = 0; i < nfound; i++)
         if (found[i].be == &clap_backend) clap_n++; else vst3_n++;
      buf_fmt(&b, "{\"ok\":true,\"name\":\"pluginhost\",\"plugins\":%d,\"clap\":%d,\"vst3\":%d}",
              nfound, clap_n, vst3_n);
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
   char    buf[4096];
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
      } else {
         printf("pluginhost — your CLAP and VST3 plugins, played in a browser\n\n"
                "  --port N       listen on 127.0.0.1:N (default 7777)\n"
                "  --scan PATH    also scan this folder, or load this one plugin\n"
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

   say("pluginhost: scanning for CLAP and VST3 plugins…");
   scan_all(extra, nextra);
   int clap_n = 0, vst3_n = 0;
   for (int i = 0; i < nfound; i++)
      if (found[i].be == &clap_backend) clap_n++; else vst3_n++;
   say("pluginhost: %d plugin%s found (%d CLAP, %d VST3)", nfound, nfound == 1 ? "" : "s",
       clap_n, vst3_n);
   for (int i = 0; i < nfound && verbose; i++)
      say("  [%s] %s — %s (%s)", found[i].be->name, found[i].name, found[i].vendor, found[i].id);

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

   // One request at a time, deliberately. Both formats have threading rules
   // about which thread may call what, and the simplest way to never break
   // them is to have one thread. A local tool with one user does not need more.
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
   unload_current();
   return 0;
}
