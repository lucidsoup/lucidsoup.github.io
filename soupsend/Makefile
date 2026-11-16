# soupsend
#
#   make              the test sink only — builds anywhere, needs nothing.
#                     Bakes the playground in, so the binary serves itself.
#   make ndi          adds the NDI sink. Needs the NDI SDK, which is a
#                     licensed download from Vizrt, not a package:
#                     https://ndi.video/for-developers/ndi-sdk/
#                     make ndi NDI_SDK=/path/to/NDI\ SDK
#   make spout        Windows only, and not from here. See README.md.
#
# The test sink is not a stub: it is how the transport is checked without
# either SDK present, and it is worth keeping for exactly that.

CC      ?= cc
CFLAGS  ?= -O2 -Wall -Wextra -std=gnu11
LDFLAGS ?=
SRC      = send.c sha1.c sink_test.c embedded.c
OBJ      = $(SRC:.c=.o)
SITE    ?= ..

NDI_SDK ?= /usr/local
NDI_INC  = $(NDI_SDK)/include
NDI_LIB  = $(NDI_SDK)/lib/x86_64-linux-gnu

all: soupsend

# The page, baked in, so the binary is the whole thing. Generated rather than
# committed: a checked-in copy of playground.html would drift from the real
# one within a week.
embedded.c: embed.py $(SITE)/playground.html $(SITE)/lucid.css $(SITE)/lucid.js
	python3 embed.py $(SITE) > $@

soupsend: $(OBJ) sink_none.o
	$(CC) $(CFLAGS) -o $@ $^ $(LDFLAGS)

ndi: CFLAGS += -DHAVE_NDI -I$(NDI_INC)
ndi: LDFLAGS += -L$(NDI_LIB) -lndi -Wl,-rpath,$(NDI_LIB)
ndi: $(OBJ) sink_ndi.o
	$(CC) $(CFLAGS) -o soupsend $^ $(LDFLAGS)

%.o: %.c
	$(CC) $(CFLAGS) -c $< -o $@

clean:
	rm -f *.o soupsend embedded.c

.PHONY: all ndi clean
