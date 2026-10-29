float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += vnoise(p) * a;
    p *= 2.1;
    a *= 0.5;
  }
  return v;
}

vec4 effect(vec2 uv) {
  vec4 base = getColor(uv);
  float far = 1.0 - getDepth(uv);
  float reach = mix(0.25, 0.95, alcance);

  // Neblina: mais grossa quanto mais longe, com nuvens de névoa passando devagar.
  vec2 s = vec2(uv.x * ratio, uv.y);
  float drift = time * movimento * 0.05;
  float texture_ = mix(1.0, 0.55 + 0.9 * fbm(s * 3.0 + vec2(drift, drift * 0.3)), movimento);
  float fog = neblina * smoothstep(1.0 - reach, 1.0, far) * texture_;
  vec3 col = mix(base.rgb, cor, clamp(fog, 0.0, 0.92));

  // Raios: a luz atravessa o que está longe e é bloqueada pelo que está perto (a pessoa faz sombra).
  if (raios > 0.0) {
    vec2 light = vec2(origem.x, 1.0 - origem.y);
    float sum = 0.0;
    float decay = 1.0;
    for (int i = 0; i < 32; i++) {
      vec2 p = mix(uv, light, float(i) / 32.0 * 0.92);
      float open = smoothstep(0.35, 0.75, 1.0 - getDepth(p));
      sum += open * decay;
      decay *= 0.965;
    }
    float rays = sum / 20.0 * exp(-length((uv - light) * vec2(ratio, 1.0)) * 0.9);
    col += corLuz * rays * raios * smoothstep(0.2, 0.6, far) * 0.8;
  }
  return vec4(col, base.a);
}
