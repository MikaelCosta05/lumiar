// RGB Split: o vermelho e o azul deslocados em sentidos opostos. O que sai do quadro é lido espelhado, então as
// bordas não ganham uma faixa esticada de uma cor só.
vec2 mirrorUv(vec2 p) { return 1.0 - abs(1.0 - mod(p, 2.0)); }

vec4 effect(vec2 uv) {
  float a = radians(angle);
  vec2 offset = vec2(cos(a), sin(a) * ratio) * amount;
  vec4 c = getColor(uv);
  c.r = getColor(mirrorUv(uv + offset)).r;
  c.b = getColor(mirrorUv(uv - offset)).b;
  return c;
}
