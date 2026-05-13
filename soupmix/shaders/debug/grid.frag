#version 450 core

in  vec2 v_uv;
out vec4 frag;

uniform float u_scale;
uniform float u_thickness;

void main() {
    vec2 g = abs(fract(v_uv * u_scale) - 0.5);
    float d = min(g.x, g.y);
    float v = smoothstep(u_thickness, 0.0, d);
    frag = vec4(vec3(v), 1.0);
}
