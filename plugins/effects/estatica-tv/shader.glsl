float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec4 effect(vec2 uv) {
  float t = floor(time * 30.0);
  float jitter = (hash(vec2(floor(uv.y * 200.0), t)) - 0.5) * 0.01 * amount;
  vec3 c = getColor(uv + vec2(jitter, 0.0)).rgb;
  float n = hash(floor(uv * resolution / 2.0) + t * 13.1);
  return vec4(mix(c, vec3(n), amount), 1.0);
}
