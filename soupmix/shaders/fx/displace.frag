#version 450 core

in  vec2 v_uv;
out vec4 frag;

uniform sampler2D u_tex;
uniform sampler2D u_displace;
uniform float     u_amount;

void main() {
    vec2 d = texture(u_displace, v_uv).rg * 2.0 - 1.0;
    frag = texture(u_tex, v_uv + d * u_amount);
}
