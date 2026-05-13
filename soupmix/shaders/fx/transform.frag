#version 450 core

in  vec2 v_uv;
out vec4 frag;

uniform sampler2D u_tex;
uniform vec2      u_translate;
uniform float     u_rotate;
uniform vec2      u_scale;

void main() {
    vec2 p = (v_uv - 0.5) / u_scale;
    float c = cos(u_rotate);
    float s = sin(u_rotate);
    p = mat2(c, -s, s, c) * p;
    frag = texture(u_tex, p + 0.5 - u_translate);
}
