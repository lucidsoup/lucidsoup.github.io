# Building soupmix

## Linux

Tested on Ubuntu 22.04 / 24.04 and Fedora 40 with GCC 12+ and Clang 16+.

### System packages

```sh
sudo apt install build-essential cmake ninja-build git \
    libgl1-mesa-dev libx11-dev libxi-dev libxrandr-dev libxinerama-dev libxcursor-dev \
    libasound2-dev libpulse-dev libudev-dev pkg-config
```

Fedora:

```sh
sudo dnf install gcc-c++ cmake ninja-build git \
    mesa-libGL-devel libX11-devel libXi-devel libXrandr-devel libXinerama-devel libXcursor-devel \
    alsa-lib-devel pulseaudio-libs-devel systemd-devel pkgconf
```

### Configure and build

```sh
cmake --preset linux-debug
cmake --build --preset linux-debug -j
```

The first configure downloads and builds all third-party libraries via
`FetchContent` (see `cmake/Dependencies.cmake`). Subsequent configures
re-use the populated sources under `build/<preset>/_deps/`.

### Run

```sh
./build/linux-debug/bin/soupmix
```

To run with an example project:

```sh
./build/linux-debug/bin/soupmix --project projects/examples/hello-fractal
```

### Tests

```sh
ctest --preset linux-debug
```

### Useful CMake options

| Option                 | Default | Notes                                           |
|------------------------|---------|-------------------------------------------------|
| `SOUPMIX_BUILD_TESTS`  | ON      | Build unit tests (uses fetched GoogleTest).     |
| `SOUPMIX_BUILD_TOOLS`  | ON      | Build `shaderlint`, `project_inspector`, ...    |
| `SOUPMIX_ENABLE_ASAN`  | OFF*    | Enable AddressSanitizer. Debug preset turns on. |
| `SOUPMIX_ENABLE_UBSAN` | OFF*    | Enable UB Sanitizer. Debug preset turns on.     |

## Editor / IDE

`CMAKE_EXPORT_COMPILE_COMMANDS=ON` is set in every preset.
`compile_commands.json` lives in the build directory; symlink it to the
repo root for clangd / IDEs:

```sh
ln -sf build/linux-debug/compile_commands.json compile_commands.json
```

## Troubleshooting

- **GLFW fails to open a window over SSH**: enable X11 forwarding
  (`ssh -X`) or run a local session. soupmix needs a real GL context.
- **Missing OpenGL 4.5**: check `glxinfo | grep "OpenGL core profile version"`.
  Intel iGPUs older than ~2014 may not support 4.5.
- **`FetchContent` errors with no network**: pre-populate
  `build/<preset>/_deps/` by running one configure with network access,
  then `cp -r` between machines.
