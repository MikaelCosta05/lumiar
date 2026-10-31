// Vinheta: círculo com a proporção da tela certa, queda com curva suave de quinta ordem (sem o "anel" que o
// smoothstep simples marca) e a mistura com a cor feita em luz linear: para o preto, é a mesma queda de luz de uma
// lente (multiplica a luz), sem acinzentar as bordas.
vec4 effect(vec2 uv) {
  vec4 c = getColor(uv);
  vec2 p = lmCentered(uv);
  // 0 no centro, 1 nos cantos
  float d = length(p) / length(vec2(ratio, 1.0) * 0.5);
  float x = clamp((d - size) / max(softness, 1e-3), 0.0, 1.0);
  float v = x * x * x * (x * (x * 6.0 - 15.0) + 10.0);
  // Curva da quantidade: em luz linear, a mesma "Intensidade" escurece tanto quanto antes no canto.
  float k = 1.0 - pow(1.0 - clamp(v * intensity, 0.0, 1.0), 1.8);
  vec3 lin = mix(lmToLinear(c.rgb), lmToLinear(tint), k);
  return vec4(lmToSrgb(lin), c.a);
}
