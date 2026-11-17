// The page, baked into the binary. See embed.py.
#ifndef SOUPSEND_EMBEDDED_H
#define SOUPSEND_EMBEDDED_H
typedef struct {
    const char          *path;      // "/playground.html"
    const char          *mime;
    const unsigned char *data;
    unsigned             len;
} EmbFile;
extern const EmbFile embedded[];
extern const int     embedded_n;
#endif
