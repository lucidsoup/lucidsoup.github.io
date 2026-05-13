#version 450 core

in  vec2 v_uv;
out vec4 frag;

uniform sampler2D u_tex;
uniform sampler2D u_mask;
uniform float     u_gamma;
uniform float     u_black_level;

void main() {
    vec4 c = texture(u_tex, v_uv);
    float m = texture(u_mask, v_uv).r;
    m = pow(m, u_gamma);
    c.rgb = mix(vec3(u_black_level), c.rgb, m);
    frag = c;
}
