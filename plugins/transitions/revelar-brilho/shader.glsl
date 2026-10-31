// Revelar pelo brilho: as partes escuras do clipe atual trocam primeiro e as claras depois (ou o contrário).
// O brilho é lido já suavizado (mapa de níveis), então a frente de troca contorna as formas sem chuvisco de
// pixel; a troca anda com aceleração e a frente tem um brilho leve, somado como luz.

vec3 addGlow(vec3 base, vec3 lightLinear) {
  vec3 total = lmToSrgb(lmToLinear(base) + lightLinear);
  return clamp(base + lmSoftClip(total, 0.75) - lmSoftClip(base, 0.75), 0.0, 1.0);
}

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  // Brilho suavizado com tamanho fixo em pixels de 1080p (nível do mapa relativo à resolução).
  float level = log2(max(resolution.y / 1080.0, 1e-3) * 5.0);
  vec3 soft = getFromColorLod(uv, max(level, 0.0)).rgb;
  float l = lmLuma(lmToLinear(soft));
  l = pow(l, 1.0 / 2.2);  // de volta a uma escala perceptual
  l = mix(l, 1.0 - l, step(0.5, invert));
  float e = lmEaseInOutSine(progress) * (1.0 + smoothness);
  float m = 1.0 - smoothstep(e - smoothness, e, l);
  vec4 col = mix(getFromColor(uv), getToColor(uv), m);
  float band = 1.0 - smoothstep(0.0, smoothness * 0.3 + 0.01, abs(l - (e - smoothness * 0.5)));
  vec3 warm = vec3(1.0, 0.92, 0.8);
  return vec4(addGlow(col.rgb, warm * band * band * 0.12 * lmBell(progress)), col.a);
}
