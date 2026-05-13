# soupmix

A live-performance visual mixer that combines:

- **Resolume**-style clip / layer playback and live mixing,
- **TouchDesigner**-style node-graph composition for generative content, and
- **MadMapper**-style projection mapping with per-surface warping, soft-edge blending, and masks.

soupmix is written in C++20 on top of OpenGL 4.5, GLFW, Dear ImGui (with
imgui-node-editor for the graph canvas), GLM, fmt, spdlog, nlohmann_json,
RtMidi, and oscpack.

> Status: scaffolding. The repository builds an empty engine shell. See
> [`docs/`](docs) for the architectural specification this skeleton is
> growing toward.

## Building (Linux)

Dependencies (system packages):

```sh
sudo apt install build-essential cmake ninja-build \
    libgl1-mesa-dev libx11-dev libxi-dev libxrandr-dev libxinerama-dev libxcursor-dev \
    libasound2-dev libpulse-dev libudev-dev pkg-config
```

Third-party C++ libraries are fetched automatically by CMake via
`FetchContent` (see [`cmake/Dependencies.cmake`](cmake/Dependencies.cmake)).

```sh
cmake --preset linux-debug
cmake --build --preset linux-debug
ctest --preset linux-debug
./build/linux-debug/bin/soupmix
```

## Repository layout

See [`docs/architecture.md`](docs/architecture.md) for a tour of the source
tree and how the subsystems fit together.

## License

See [`LICENSE`](LICENSE).
