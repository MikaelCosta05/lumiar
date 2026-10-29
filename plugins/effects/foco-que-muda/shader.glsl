float focusNow() {
  return mix(de, para, smoothstep(inicio, inicio + duracaoFoco, time));
}

/** Quanto cada ponto fica fora de foco (0 = nítido, 1 = desfoque máximo). */
float blurAmount(vec2 uv, float focus) {
  return clamp((abs(getDepth(uv) - focus) - nitido) / max(1.0 - nitido, 0.01) * 1.6, 0.0, 1.0);
}

vec4 effect(vec2 uv) {
  vec4 base = getColor(uv);
  float focus = focusNow();
  float amount = blurAmount(uv, focus);
  float radius = amount * forca * 22.0 * resolution.y / 720.0;
  if (radius < 0.5) return base;
  // Desfoque em disco (espiral de ouro). Pontos nítidos não "vazam" para o desfocado em volta deles.
  vec3 sum = base.rgb;
  float total = 1.0;
  for (int i = 1; i < 40; i++) {
    float fi = float(i);
    float r = sqrt(fi / 40.0) * radius;
    float a = fi * 2.39996;
    vec2 p = uv + vec2(cos(a), sin(a)) * r / resolution;
    float own = blurAmount(p, focus) * forca * 22.0 * resolution.y / 720.0;
    float w = clamp(own / max(r, 0.001), 0.15, 1.0);
    vec3 c = getColor(p).rgb;
    // Luzes fortes viram bolinhas mais claras (bokeh).
    w *= 1.0 + smoothstep(0.75, 1.0, dot(c, vec3(0.333))) * 2.0;
    sum += c * w;
    total += w;
  }
  return vec4(sum / total, base.a);
}
