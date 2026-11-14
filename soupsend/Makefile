# soupsend
#
#   make              the test sink only — builds anywhere, needs nothing
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
SRC      = send.c sha1.c sink_test.c
OBJ      = $(SRC:.c=.o)

NDI_SDK ?= /usr/local
NDI_INC  = $(NDI_SDK)/include
NDI_LIB  = $(NDI_SDK)/lib/x86_64-linux-gnu

all: soupsend

soupsend: $(OBJ) sink_none.o
	$(CC) $(CFLAGS) -o $@ $^ $(LDFLAGS)

ndi: CFLAGS += -DHAVE_NDI -I$(NDI_INC)
ndi: LDFLAGS += -L$(NDI_LIB) -lndi -Wl,-rpath,$(NDI_LIB)
ndi: $(OBJ) sink_ndi.o
	$(CC) $(CFLAGS) -o soupsend $^ $(LDFLAGS)

%.o: %.c
	$(CC) $(CFLAGS) -c $< -o $@

clean:
	rm -f *.o soupsend

.PHONY: all ndi clean
