# pluginhost — a few C files, one cc invocation, no package manager.
#
# Neither set of plugin headers is vendored here. Both are permissively licensed
# and pinned to a tag below, so `make` fetches them once and nothing in this
# repository has to carry someone else's source.
#
#   CLAP  MIT,         header-only, free-audio/clap
#   VST3  BSD 3-clause, one header, steinbergmedia/vst3_c_api
#
# The BSD C binding is what makes VST3 possible here at all: the main VST3 SDK
# is C++ and dual-licensed GPLv3 / proprietary, which would be a dependency and
# a licence decision rather than a download.

CLAP_TAG  ?= 1.2.10
CLAP_DIR  ?= clap
VST3_TAG  ?= v3.8.1_build_84
VST3_DIR  ?= vst3
CFLAGS    ?= -O2 -std=c11 -Wall -Wextra -Wno-unused-parameter
CPPFLAGS  += -I$(CLAP_DIR)/include -I$(VST3_DIR)
LDLIBS    += -lm

UNAME := $(shell uname -s)
ifneq ($(UNAME),Darwin)
  LDLIBS += -ldl
endif

SRC  := host.c clap_backend.c vst3_backend.c
HDRS := host.h $(CLAP_DIR)/include/clap/clap.h $(VST3_DIR)/vst3_c_api.h

.PHONY: all clean distclean test
all: pluginhost

$(CLAP_DIR)/include/clap/clap.h:
	@echo "  fetching the CLAP $(CLAP_TAG) headers (MIT)…"
	@rm -rf $(CLAP_DIR)
	@git -c advice.detachedHead=false clone --quiet --depth 1 --branch $(CLAP_TAG) https://github.com/free-audio/clap.git $(CLAP_DIR)
	@echo "  done."

$(VST3_DIR)/vst3_c_api.h:
	@echo "  fetching the VST3 $(VST3_TAG) C API header (BSD 3-clause)…"
	@rm -rf $(VST3_DIR)
	@git -c advice.detachedHead=false clone --quiet --depth 1 --branch $(VST3_TAG) https://github.com/steinbergmedia/vst3_c_api.git $(VST3_DIR)
	@echo "  done."

pluginhost: $(SRC) $(HDRS)
	$(CC) $(CFLAGS) $(CPPFLAGS) -o $@ $(SRC) $(LDFLAGS) $(LDLIBS)

# Plugins of our own, so the host can be proven end to end on a machine with no
# plugins installed at all; test/suite.mjs measures the host against them.
test/gainplug.clap: test/gainplug.c $(HDRS)
	$(CC) $(CFLAGS) $(CPPFLAGS) -shared -fPIC -fvisibility=hidden -o $@ test/gainplug.c $(LDLIBS)

test/gainvst.vst3: test/gainvst.c $(HDRS)
	$(CC) $(CFLAGS) $(CPPFLAGS) -shared -fPIC -fvisibility=hidden -o $@ test/gainvst.c $(LDLIBS)

test: pluginhost test/gainplug.clap test/gainvst.vst3
	./test/run.sh

clean:
	rm -f pluginhost test/gainplug.clap test/gainvst.vst3

distclean: clean
	rm -rf $(CLAP_DIR) $(VST3_DIR)
