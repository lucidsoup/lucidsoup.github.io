// Only here because the WebSocket handshake demands it: the client's key,
// plus a fixed GUID, hashed and base64'd back. No other part of this program
// has any business with cryptography, and this one is not security — the
// handshake is a protocol formality.
#ifndef SOUPSEND_SHA1_H
#define SOUPSEND_SHA1_H
#include <stddef.h>
#include <stdint.h>
void sha1(const uint8_t *data, size_t len, uint8_t out[20]);
void base64(const uint8_t *in, size_t len, char *out);   // out: 4*ceil(len/3)+1
#endif
