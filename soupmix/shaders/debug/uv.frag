#version 450 core

in  vec2 v_uv;
out vec4 frag;

void main() {
    frag = vec4(v_uv, 0.0, 1.0);
}
