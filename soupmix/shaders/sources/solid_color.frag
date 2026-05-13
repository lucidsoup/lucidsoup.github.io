#version 450 core

uniform vec4 u_color;

out vec4 frag;

void main() {
    frag = u_color;
}
