#version 450 core

in  vec2 v_uv;
out vec4 frag;

uniform sampler2D u_tex;
uniform sampler2D u_mask;
uniform float     u_invert;

void main() {
    vec4 c = texture(u_tex,  v_uv);
    float m = texture(u_mask, v_uv).r;
    m = mix(m, 1.0 - m, u_invert);
    frag = vec4(c.rgb, c.a * m);
}
