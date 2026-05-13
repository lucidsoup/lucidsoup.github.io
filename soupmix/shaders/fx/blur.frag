#version 450 core

in  vec2 v_uv;
out vec4 frag;

uniform sampler2D u_tex;
uniform vec2      u_texel;
uniform float     u_radius;

void main() {
    vec4 sum = vec4(0.0);
    float w = 0.0;
    for (int x = -2; x <= 2; ++x) {
        for (int y = -2; y <= 2; ++y) {
            float k = exp(-(x*x + y*y) / max(0.01, u_radius));
            sum += k * texture(u_tex, v_uv + vec2(x, y) * u_texel);
            w   += k;
        }
    }
    frag = sum / max(w, 0.0001);
}
