// Corte de espada: um risco de luz corre pela diagonal (de canto a canto, na proporção da tela), a imagem se
// parte em duas metades que se abrem um pouco e depois deslizam em sentidos opostos com aceleração, com
// desfoque de movimento proporcional à velocidade, bordas antisserrilhadas sem fresta, o fio do corte ainda
// brilhando e uma sombra das metades sobre o próximo clipe.

vec3 addGlow(vec3 base, vec3 lightLinear) {
  vec3 total = lmToSrgb(lmToLinear(base) + lightLinear);
  return clamp(base + lmSoftClip(total, 0.75) - lmSoftClip(base, 0.75), 0.0, 1.0);
}

float slideOf(float t) { return lmEaseInCubic(clamp((t - 0.2) / 0.8, 0.0, 1.0)); }
float gapOf(float t) { return lmEaseOutCubic(clamp((t - 0.12) / 0.15, 0.0, 1.0)); }

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  vec2 p = lmCentered(uv);
  vec2 d = normalize(vec2(ratio, 1.0));  // a diagonal, de baixo à esquerda para cima à direita
  vec2 n = vec2(-d.y, d.x);               // normal: aponta para a metade de cima
  float L = length(vec2(ratio, 1.0));
  float px = 1.0 / resolution.y;

  float slide = slideOf(progress);
  float gap = gapOf(progress);
  // Deslocamento da metade de cima (a de baixo vai ao contrário).
  vec2 off = d * slide * L * 1.08 + n * (gap * lmPx(10.0) + slide * 0.2);
  float dSlide = (slideOf(progress + 0.004) - slideOf(progress - 0.004)) / 0.008;
  vec2 vel = d * dSlide * L * 1.08 + n * dSlide * 0.2;   // altura de tela por progresso
  vec2 blurVec = vel / 120.0;                            // ~meio quadro de 1 s
  float soft = 1.5 * px + length(blurVec) * 0.5;

  vec2 halfScreen = vec2(ratio * 0.5, 0.5);
  vec2 qa = p - off;
  vec2 qb = p + off;
  float covA = clamp(0.5 + dot(qa, n) / soft, 0.0, 1.0) * clamp(0.5 - lmSdBox(qa, halfScreen) / soft, 0.0, 1.0);
  float covB = clamp(0.5 - dot(qb, n) / soft, 0.0, 1.0) * clamp(0.5 - lmSdBox(qb, halfScreen) / soft, 0.0, 1.0);
  vec2 bUv = blurVec * vec2(1.0 / ratio, 1.0);
  vec4 fa = length(blurVec) > px ? lmMotionBlurFrom(lmUncentered(qa), bUv, 16) : getFromColor(lmUncentered(qa));
  vec4 fb = length(blurVec) > px ? lmMotionBlurFrom(lmUncentered(qb), -bUv, 16) : getFromColor(lmUncentered(qb));
  vec4 to = getToColor(uv);
  // Sombra das metades no próximo clipe, perto do vão.
  float edgeDist = min(abs(dot(qa, n)), abs(dot(qb, n)));
  to.rgb *= 1.0 - 0.45 * exp(-edgeDist / 0.05) * gap * (1.0 - slide);
  // Composição sem fresta: as duas coberturas somam 1 enquanto as metades estão juntas.
  float wTo = max(1.0 - covA - covB, 0.0);
  vec4 col = (fa * covA + fb * covB + to * wTo) / max(covA + covB + wTo, 1e-4);

  // Risco de luz: a cabeça corre pela diagonal no começo; depois o fio continua aceso nas duas bordas.
  float head = mix(-L * 0.5 - 0.2, L * 0.5 + 0.2, lmEaseOutCubic(clamp(progress / 0.2, 0.0, 1.0)));
  float along = dot(p, d);
  float drawn = smoothstep(0.0, 0.03, head - along) * (0.35 + 0.65 * exp(-max(head - along, 0.0) / 0.5));
  float fade = 1.0 - smoothstep(0.25, 0.6, progress);
  float line = exp(-edgeDist / lmPx(1.5)) + exp(-edgeDist / lmPx(10.0)) * 0.35 + exp(-edgeDist / lmPx(45.0)) * 0.1;
  float spark = exp(-length(p - d * head) / lmPx(30.0)) * (1.0 - smoothstep(0.15, 0.22, progress));
  vec3 light = lmToLinear(tint) * (line * drawn * fade * 1.6 + spark * 1.5);
  return vec4(addGlow(col.rgb, light), col.a);
}
