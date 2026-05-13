#version 450 core

in  vec2 v_uv;
out vec4 frag;

uniform vec2  u_center;
uniform float u_zoom;
uniform int   u_iter;
uniform float u_time;

void main() {
    vec2 c = (v_uv * 2.0 - 1.0) / u_zoom + u_center;
    vec2 z = vec2(0.0);
    int  i = 0;
    for (; i < u_iter; ++i) {
        z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
        if (dot(z, z) > 4.0) break;
    }
    float t = float(i) / float(u_iter);
    vec3 col = 0.5 + 0.5 * cos(6.2831 * (t + vec3(0.0, 0.33, 0.67)) + u_time);
    frag = vec4(col, 1.0);
}
