#version 450 core

in  vec2 v_uv;
out vec4 frag;

uniform sampler2D u_tex;
uniform int       u_segments;
uniform float     u_rotate;

void main() {
    vec2 p = v_uv * 2.0 - 1.0;
    float r = length(p);
    float a = atan(p.y, p.x) + u_rotate;
    float seg = 6.2831 / float(max(u_segments, 1));
    a = mod(a, seg);
    a = abs(a - seg * 0.5);
    vec2 q = vec2(cos(a), sin(a)) * r * 0.5 + 0.5;
    frag = texture(u_tex, q);
}
