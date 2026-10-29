vec3 hue(float h) {
  return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
}

/** Distância (em pixels) até a pessoa, procurando em anéis cada vez maiores, até `range`. */
float distanceToPerson(vec2 uv, float range) {
  if (getPerson(uv) > 0.5) return 0.0;
  for (int k = 1; k <= 12; k++) {
    float r = range * float(k) / 12.0;
    for (int i = 0; i < 16; i++) {
      float a = (float(i) + float(k) * 0.37) * 0.3927;
      if (getPerson(uv + vec2(cos(a), sin(a)) * r / resolution) > 0.5) return r;
    }
  }
  return range * 2.0;
}

vec4 effect(vec2 uv) {
  vec4 base = getColor(uv);
  float px = resolution.y / 720.0;
  float offset = distancia * 24.0 * px;
  float width = (1.5 + largura * 9.0) * px;
  float glowSize = (6.0 + brilho * 14.0) * px;
  float d = distanceToPerson(uv, offset + width + glowSize);
  if (d <= 0.0 && offset > 0.5) return base;

  float line = 1.0 - smoothstep(width * 0.5, width * 0.5 + 1.5 * px, abs(d - offset - width * 0.5));
  float glow = exp(-max(d - offset - width, 0.0) / glowSize) * step(offset, d + 0.5);
  float beat = 0.5 + 0.5 * sin(time * pulso * PI);
  vec3 col = arcoiris > 0.5 ? hue(time * 0.15 + uv.y * 0.6) : mix(cor, cor2, beat);
  float strength = brilho * (0.75 + 0.25 * beat);
  vec3 lit = base.rgb + col * glow * strength * 0.7;
  return vec4(mix(lit, mix(col, vec3(1.0), 0.35), line), base.a);
}
