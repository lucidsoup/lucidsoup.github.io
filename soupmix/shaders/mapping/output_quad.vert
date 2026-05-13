#version 450 core

layout(location = 0) in vec2 a_pos;
layout(location = 1) in vec2 a_uv;

uniform mat3 u_homography;
uniform vec2 u_canvas_size;

out vec2 v_uv;

void main() {
    vec3 p = u_homography * vec3(a_pos, 1.0);
    p.xy /= p.z;
    vec2 ndc = (p.xy / u_canvas_size) * 2.0 - 1.0;
    ndc.y = -ndc.y;
    gl_Position = vec4(ndc, 0.0, 1.0);
    v_uv        = a_uv;
}
