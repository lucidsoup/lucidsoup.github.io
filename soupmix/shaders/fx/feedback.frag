#version 450 core

in  vec2 v_uv;
out vec4 frag;

uniform sampler2D u_current;
uniform sampler2D u_previous;
uniform float     u_decay;
uniform vec2      u_offset;

void main() {
    vec4 cur  = texture(u_current,  v_uv);
    vec4 prev = texture(u_previous, v_uv + u_offset);
    frag = max(cur, prev * u_decay);
}
