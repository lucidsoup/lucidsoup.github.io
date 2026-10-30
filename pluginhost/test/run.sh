#!/bin/sh
# Builds nothing: `make test` has already done that. Just runs the suite.
exec node "$(dirname "$0")/suite.mjs" "$@"
