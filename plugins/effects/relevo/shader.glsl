float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec4 effect(vec2 uv) {
  float k = resolution.y / 720.0;
  vec2 px = vec2(1.5 * k) / resolution;
  vec3 e = getColor(uv - px).rgb - getColor(uv + px).rgb;
  float l = luma(e) * strength + 0.5;
  vec3 c = getColor(uv).rgb;
  return vec4(mix(vec3(l), c * (l + 0.5), colorful), 1.0);
}
