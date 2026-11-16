# soupsend
#
#   make              the test sink only — builds anywhere, needs nothing.
#                     Bakes the playground in, so the binary serves itself.
#   make ndi          adds the NDI sink. Needs the NDI SDK, which is a
#                     licensed download from Vizrt, not a package. The
#                     library is linked by its full path rather than with
#                     -lndi, because the SDK ships libndi.so.6.x.y with no
#                     .so symlink unless you run its own installer:
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

# Quoted, because the SDK unpacks to a directory called "NDI SDK for Linux"
# and an unquoted -I turns that into three arguments, two of which cc tries
# to link. Nothing but a real build against the real SDK finds this.
ndi: CFLAGS += -DHAVE_NDI -I"$(NDI_INC)"
# sink_none.o as well: it carries the "not in this build" answer for Spout,
# which is still absent here. Leaving it out left sink_spout_new undefined at
# link time.
ndi: $(OBJ) sink_ndi.o sink_none.o
	@so=`ls "$(NDI_LIB)"/libndi.so* 2>/dev/null | sort | tail -1`; \
	 if [ -z "$$so" ]; then \
	   echo "no libndi under $(NDI_LIB) — point NDI_SDK at the unpacked SDK"; exit 1; \
	 fi; \
	 echo "$(CC) ... -o soupsend $^ $$so"; \
	 $(CC) $(CFLAGS) -o soupsend $^ "$$so" -Wl,-rpath,"$(NDI_LIB)" $(LDFLAGS)

%.o: %.c
	$(CC) $(CFLAGS) -c $< -o $@

clean:
	rm -f *.o soupsend embedded.c

.PHONY: all ndi clean
