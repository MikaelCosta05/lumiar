float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec4 effect(vec2 uv) {
  float l = pow(clamp(luma(getColor(uv).rgb) * gain, 0.0, 1.0), 0.8);
  l += (hash(floor(uv * resolution) + fract(time * 13.0) * 97.0) - 0.5) * grain * 0.45;
  l *= 0.92 + 0.08 * sin(uv.y * resolution.y * 1.3);
  vec3 col = vec3(0.12, 1.0, 0.3) * l;
  vec2 p = (uv - 0.5) * vec2(ratio, 1.0);
  float d = min(length(p - vec2(-0.32, 0.0)), length(p - vec2(0.32, 0.0)));
  float mask = 1.0 - smoothstep(0.44, 0.48, d);
  return vec4(col * mix(1.0, mask, binocular), 1.0);
}
