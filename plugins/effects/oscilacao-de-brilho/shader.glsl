// Oscilação de brilho: a luz não se decide. A tremulação é um ganho de exposição em luz linear (como uma lâmpada ou
// um controle de ganho instável), com uma parte lenta e suave e outra que muda a cada quadro de vídeo (30 por
// segundo). As quedas apagam a luz de repente e voltam em alguns quadros (não um degrau seco). A faixa de
// interferência é o batimento de 60 Hz da rede com os 59,94 Hz do vídeo: uma barra escura larga e suave que sobe.

vec4 effect(vec2 uv) {
  vec4 c = getColor(uv);
  float t = time * velocidade;
  float frame = floor(time * 29.97);
  // Tremulação: lenta (ruído suave) + rápida (um valor por quadro), em diafragmas (stops).
  float slow = lmNoise(vec2(t * 3.0, 0.53)) * 0.55 + lmNoise(vec2(t * 9.0, 4.1)) * 0.25;
  float fast = (lmHash(vec2(floor(t * 29.97), 2.0)) - 0.5) * 0.35;
  float stops = (slow + fast) * forca * 0.8;

  // Quedas: em algumas janelas de 1/8 s a luz despenca e volta.
  float slot = floor(t * 8.0);
  float drop = step(1.0 - quedas * 0.12, lmHash(vec2(slot, 5.0)));
  float env = lmPulse(fract(t * 8.0), 0.15);
  stops -= drop * env * mix(1.6, 2.6, lmHash(vec2(slot, 6.0)));

  // Barra de zumbido subindo pela tela.
  float hum = 0.5 + 0.5 * cos((uv.y - time * 0.12) * 2.0 * PI);
  float bar = faixa * 0.45 * hum * hum * hum;

  vec3 lin = lmToLinear(c.rgb) * exp2(stops) * (1.0 - bar);
  return vec4(clamp(lmToSrgb(lin), 0.0, 1.0), c.a);
}
