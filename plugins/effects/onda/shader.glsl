// Ondulação (reflexo na água): duas ondas por eixo, a principal e uma menor mais rápida, para o movimento não
// parecer um seno mecânico. O que sai do quadro é lido espelhado (a borda não estica).
vec2 mirrorUv(vec2 p) { return 1.0 - abs(1.0 - mod(p, 2.0)); }

vec4 effect(vec2 uv) {
  float w = frequency * 2.0 * PI;
  float t = time * speed;
  vec2 p = uv;
  p.x += (sin(uv.y * w + t) + 0.3 * sin(uv.y * w * 2.3 - t * 1.6 + 1.3)) / 1.3 * amplitude;
  p.y += (cos(uv.x * w + t * 0.8) + 0.3 * cos(uv.x * w * 1.9 + t * 1.3 + 2.1)) / 1.3 * amplitude * 0.5;
  return getColor(mirrorUv(p));
}
