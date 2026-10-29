float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float vnoise(float x) {
  float i = floor(x);
  float f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(hash(vec2(i, 0.53)), hash(vec2(i + 1.0, 0.53)), f);
}

vec4 effect(vec2 uv) {
  vec4 c = getColor(uv);
  float t = time * velocidade;
  // Tremulação: uma oscilação lenta e outra rápida, sem ritmo certo.
  float flicker = (vnoise(t * 6.0) - 0.5) * 0.6 + (hash(vec2(floor(t * 24.0), 2.0)) - 0.5) * 0.25;
  float gain = 1.0 + flicker * forca;
  // Quedas: em alguns décimos de segundo a luz quase apaga.
  float slot = floor(t * 8.0);
  float drop = step(1.0 - quedas * 0.12, hash(vec2(slot, 5.0)));
  gain *= mix(1.0, 0.18 + 0.2 * hash(vec2(slot, 6.0)), drop);
  // Faixa de interferência da rede elétrica subindo pela tela.
  float hum = 0.5 + 0.5 * sin((uv.y - time * 0.12) * 2.0 * PI);
  gain *= 1.0 - faixa * 0.35 * hum * hum;
  return vec4(clamp(c.rgb * gain, 0.0, 1.0), c.a);
}
