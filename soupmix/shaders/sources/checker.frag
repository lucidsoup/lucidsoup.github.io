#version 450 core

in  vec2 v_uv;
out vec4 frag;

uniform vec2  u_scale;
uniform vec4  u_color_a;
uniform vec4  u_color_b;

void main() {
    vec2 g = floor(v_uv * u_scale);
    float k = mod(g.x + g.y, 2.0);
    frag = mix(u_color_a, u_color_b, k);
}
