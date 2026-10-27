float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec4 effect(vec2 uv) {
  float t = time;
  float jump = step(0.96, hash(vec2(floor(t * 12.0), 1.0)));
  float shift = jump * (hash(vec2(floor(uv.y * 30.0), floor(t * 12.0))) - 0.5) * 0.06;
  vec3 src = getColor(uv + vec2(shift, 0.0)).rgb;
  float l = luma(src);
  float k = resolution.y / 720.0;
  float scan = 0.65 + 0.35 * sin((uv.y * resolution.y / k) * 0.8 - t * 8.0);
  float band = exp(-pow((fract(uv.y * 0.7 - t * 0.25) - 0.5) * 12.0, 2.0));
  vec3 holo = tint * (l * 1.5 + 0.08) * scan + tint * band * 0.35;
  holo *= 0.85 + 0.15 * hash(vec2(floor(t * 24.0), 7.0));
  return vec4(mix(src, holo, opacity), 1.0);
}
