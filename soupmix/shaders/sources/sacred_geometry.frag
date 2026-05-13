#version 450 core

in  vec2 v_uv;
out vec4 frag;

uniform float u_time;
uniform int   u_petals;

void main() {
    vec2 p = v_uv * 2.0 - 1.0;
    float r = length(p);
    float a = atan(p.y, p.x);
    float f = cos(a * float(u_petals) + u_time);
    float d = abs(r - 0.5 + 0.1 * f);
    float v = smoothstep(0.02, 0.0, d);
    frag = vec4(vec3(v), 1.0);
}
