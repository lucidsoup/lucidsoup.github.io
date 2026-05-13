#version 450 core

in  vec2 v_uv;
out vec4 frag;

uniform sampler2D u_tex;
uniform vec3      u_key_color;
uniform float     u_threshold;
uniform float     u_smoothness;

void main() {
    vec4 c = texture(u_tex, v_uv);
    float d = length(c.rgb - u_key_color);
    float a = smoothstep(u_threshold, u_threshold + u_smoothness, d);
    frag = vec4(c.rgb, c.a * a);
}
