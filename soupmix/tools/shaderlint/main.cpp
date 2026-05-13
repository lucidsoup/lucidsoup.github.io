#include <cstdio>
#include <filesystem>

// shaderlint: compile every .vert/.frag under shaders/ and report errors.
// For now this is a placeholder that lists files; once render::Shader can
// compile without a window context (or a headless EGL context exists), it
// will compile each shader and report diagnostics.

int main(int argc, char** argv) {
    if (argc < 2) {
        std::fprintf(stderr, "usage: shaderlint <shaders-dir>\n");
        return 1;
    }
    int count = 0;
    for (const auto& e : std::filesystem::recursive_directory_iterator(argv[1])) {
        if (!e.is_regular_file()) continue;
        const auto ext = e.path().extension().string();
        if (ext == ".vert" || ext == ".frag" || ext == ".glsl") {
            std::printf("  %s\n", e.path().c_str());
            ++count;
        }
    }
    std::printf("found %d shader files\n", count);
    return 0;
}
