float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec4 effect(vec2 uv) {
  float step_ = max(passo, 0.02);
  float seg = floor(time / step_);
  float age = time - seg * step_;
  // Alguns trechos andam normal (o engasgo fica imprevisível).
  bool live = hash(vec2(seg, 3.7)) < irregular * 0.6;
  // No quadro em que a imagem pula, ela dá um tranco curto para cima ou para baixo.
  float kick = (1.0 - smoothstep(0.0, 0.06, age)) * (hash(vec2(seg, 8.1)) - 0.5) * 0.02 * tranco;
  vec2 u = vec2(uv.x, uv.y + kick);
  if (live || age < 0.017) return vec4(getColor(u).rgb, 1.0);
  return vec4(getPast(u, age).rgb, 1.0);
}
