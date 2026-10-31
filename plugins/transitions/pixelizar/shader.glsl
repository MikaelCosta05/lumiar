// Pixelizar (a ideia do "pixelize" do gl-transitions, MIT): a imagem vira blocos quadrados que crescem em
// etapas com aceleração, troca de clipe no auge (mistura em luz linear) e volta ao normal. Cada bloco tem a cor
// média da sua área (mapa de níveis), sem cintilar quando a imagem se mexe. "Blocos (mínimo)" = quantos blocos
// cabem na altura no auge; "Etapas" = degraus do tamanho (0 = contínuo).

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  float d = lmEaseInOutSine(min(progress, 1.0 - progress) * 2.0) * 0.5;
  float dist = steps > 0.0 ? ceil(d * steps) / steps : d;
  vec2 squareSize = 2.0 * dist / vec2(blocks * ratio, blocks);
  vec2 p = (floor(uv / squareSize) + 0.5) * squareSize;
  float level = max(log2(squareSize.y * resolution.y) - 0.5, 0.0);
  float m = smoothstep(0.3, 0.7, progress);
  vec3 a = lmToLinear(getFromColorLod(p, level).rgb);
  vec3 b = lmToLinear(getToColorLod(p, level).rgb);
  return vec4(lmToSrgb(mix(a, b, m)), 1.0);
}
