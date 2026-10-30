# pluginhost — one C file, one cc invocation, no package manager.
#
# The CLAP headers are not vendored here. They are MIT, header-only, and pinned
# to a tag below, so `make` fetches them once into clap/ and nothing in this
# repository has to carry someone else's 68 files.

CLAP_TAG  ?= 1.2.10
CLAP_DIR  ?= clap
CFLAGS    ?= -O2 -std=c11 -Wall -Wextra -Wno-unused-parameter
CPPFLAGS  += -I$(CLAP_DIR)/include
LDLIBS    += -lm

UNAME := $(shell uname -s)
ifneq ($(UNAME),Darwin)
  LDLIBS += -ldl
endif

.PHONY: all clean distclean test
all: pluginhost

$(CLAP_DIR)/include/clap/clap.h:
	@echo "  fetching the CLAP $(CLAP_TAG) headers (MIT)…"
	@rm -rf $(CLAP_DIR)
	@git -c advice.detachedHead=false clone --quiet --depth 1 --branch $(CLAP_TAG) https://github.com/free-audio/clap.git $(CLAP_DIR)
	@echo "  done."

pluginhost: host.c $(CLAP_DIR)/include/clap/clap.h
	$(CC) $(CFLAGS) $(CPPFLAGS) -o $@ host.c $(LDFLAGS) $(LDLIBS)

# A CLAP plugin of our own, so the host can be proven end to end on a machine
# with no plugins installed at all; test/suite.mjs measures the host against it.
test/gainplug.clap: test/gainplug.c $(CLAP_DIR)/include/clap/clap.h
	$(CC) $(CFLAGS) $(CPPFLAGS) -shared -fPIC -fvisibility=hidden -o $@ test/gainplug.c $(LDLIBS)

test: pluginhost test/gainplug.clap
	./test/run.sh

clean:
	rm -f pluginhost test/gainplug.clap

distclean: clean
	rm -rf $(CLAP_DIR)
