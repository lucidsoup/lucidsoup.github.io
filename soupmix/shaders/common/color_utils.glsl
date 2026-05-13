// Shared color-space helpers.
// Included by other fragment shaders via a textual include (handled
// engine-side by src/render/Shader.cpp's preprocess step, planned).

vec3 srgbToLinear(vec3 c) {
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

vec3 linearToSrgb(vec3 c) {
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

vec3 hsvToRgb(vec3 hsv) {
    vec3 k = mod(vec3(5.0, 3.0, 1.0) + hsv.x * 6.0, 6.0);
    k = max(min(min(k, 4.0 - k), 1.0), 0.0);
    return hsv.z * mix(vec3(1.0), k, hsv.y);
}
