// Batimento: dois pulsos de coração (o segundo mais forte) e a troca no pico do segundo. Cada pulso é um tranco de
// zoom que sobe muito rápido e decai suave (subida gaussiana, descida exponencial de ordem 1,5, sem quina no pico),
// com desfoque radial proporcional à velocidade do zoom; as bordas escurecem e ganham vermelho de sangue a cada
// batida (multiplicado em luz linear, com a vinheta redonda de lente).

float beat(float t, float at) {
  float x = t - at;
  return x < 0.0 ? exp(-pow(x / 0.028, 2.0)) : exp(-pow(x / 0.1, 1.5));
}

float pulse(float t) {
  float p = beat(t, 0.22) + beat(t, 0.52) * 1.3;
  return p * (1.0 - smoothstep(0.86, 1.0, t));
}

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  float b = pulse(progress);
  float z = 1.0 + b * 0.15 * strength;
  vec2 q = (uv - 0.5) / z + 0.5;
  // Quanto a escala anda em ~1/2 quadro: o rastro só aparece no tranco.
  float dz = abs(pulse(progress + 0.025) - pulse(progress - 0.025)) * 0.15 * strength;
  float amount = dz / z;
  int n = int(clamp(ceil(amount * length(resolution) * 0.5 / 2.5), 1.0, 24.0));
  vec4 c = progress < 0.52 ? lmZoomBlurFrom(q, vec2(0.5), amount, n) : lmZoomBlurTo(q, vec2(0.5), amount, n);
  vec3 lin = lmToLinear(c.rgb);
  float edge = 1.0 - lmVignette(uv, 1.0, 1.0);
  float k = clamp(b * min(strength, 1.5), 0.0, 1.5);
  lin *= mix(vec3(1.0), vec3(0.55, 0.12, 0.14), clamp(edge * 0.85 * k, 0.0, 1.0));
  return vec4(lmToSrgb(lin), 1.0);
}
