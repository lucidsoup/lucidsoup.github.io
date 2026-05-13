#version 450 core

in  vec2 v_uv;
out vec4 frag;

uniform sampler2D u_tex;
uniform float     u_brightness;
uniform float     u_contrast;
uniform float     u_saturation;

void main() {
    vec4 c = texture(u_tex, v_uv);
    c.rgb = (c.rgb - 0.5) * u_contrast + 0.5 + u_brightness;
    float gray = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
    c.rgb = mix(vec3(gray), c.rgb, u_saturation);
    frag = c;
}
