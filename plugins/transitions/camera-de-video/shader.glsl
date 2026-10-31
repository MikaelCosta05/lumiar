// Câmera de vídeo: o visor de uma filmadora aparece (cantoneiras, cruz central, bateria e o "REC" piscando, tudo
// desenhado por distância, sem serrilhado, em tamanhos de 1080p), a imagem aproxima com aceleração e treme como
// câmera na mão (ruído suave), o foco "caça" (desfoque de lente) no meio, onde a troca acontece, e volta nítido no
// próximo clipe enquanto o visor some.

/** Distância a um arco de círculo (centro c, raio r) com uma abertura de meia-largura "gap" na direção "dir". */
float arcDistance(vec2 q, vec2 c, float r, vec2 dir, float gap) {
  vec2 d = q - c;
  float a = acos(clamp(dot(normalize(d + 1e-6), dir), -1.0, 1.0));
  if (a < gap) {
    vec2 side = vec2(-dir.y, dir.x);
    vec2 e1 = c + r * (dir * cos(gap) + side * sin(gap));
    vec2 e2 = c + r * (dir * cos(gap) - side * sin(gap));
    return min(length(q - e1), length(q - e2));
  }
  return abs(length(d) - r);
}

/** Distância (em unidades da letra, altura 1) ao "REC" com a origem embaixo à esquerda do R. */
float recDistance(vec2 l) {
  // R
  float d = lmSdSegment(l, vec2(0.0, 0.0), vec2(0.0, 1.0));
  d = min(d, lmSdSegment(l, vec2(0.0, 1.0), vec2(0.3, 1.0)));
  d = min(d, lmSdSegment(l, vec2(0.0, 0.5), vec2(0.3, 0.5)));
  d = min(d, arcDistance(l, vec2(0.3, 0.75), 0.25, vec2(-1.0, 0.0), PI * 0.5));
  d = min(d, lmSdSegment(l, vec2(0.28, 0.5), vec2(0.58, 0.0)));
  // E
  vec2 e = l - vec2(0.85, 0.0);
  d = min(d, lmSdSegment(e, vec2(0.0, 0.0), vec2(0.0, 1.0)));
  d = min(d, lmSdSegment(e, vec2(0.0, 1.0), vec2(0.52, 1.0)));
  d = min(d, lmSdSegment(e, vec2(0.0, 0.5), vec2(0.42, 0.5)));
  d = min(d, lmSdSegment(e, vec2(0.0, 0.0), vec2(0.52, 0.0)));
  // C
  vec2 c = l - vec2(1.62, 0.0);
  d = min(d, arcDistance(c, vec2(0.42, 0.5), 0.5, vec2(1.0, 0.0), 0.8));
  return d;
}

/** Visor: devolve (cobertura do branco, cobertura do vermelho, sombra). */
vec3 viewfinder(vec2 p, float blink) {
  float stroke = lmPx(4.0);
  // Cantoneiras.
  vec2 a = abs(p);
  vec2 corner = vec2(ratio * 0.5 - 0.06, 0.5 - 0.065);
  float arm = 0.075;
  float d = min(lmSdSegment(a, corner, corner - vec2(arm, 0.0)), lmSdSegment(a, corner, corner - vec2(0.0, arm)));
  // Cruz central.
  d = min(d, min(lmSdSegment(p, vec2(-lmPx(18.0), 0.0), vec2(lmPx(18.0), 0.0)), lmSdSegment(p, vec2(0.0, -lmPx(18.0)), vec2(0.0, lmPx(18.0)))) + lmPx(0.8));
  // Bateria: contorno, ponta e três barras.
  vec2 bat = p - vec2(ratio * 0.5 - 0.15, 0.5 - 0.115);
  d = min(d, abs(lmSdRoundBox(bat, vec2(lmPx(26.0), lmPx(12.0)), lmPx(2.5))) - lmPx(0.5));
  d = min(d, lmSdBox(bat - vec2(lmPx(30.0), 0.0), vec2(lmPx(2.0), lmPx(5.0))) - stroke * 0.5);
  for (int i = 0; i < 3; i++) d = min(d, lmSdBox(bat - vec2(lmPx(-16.0 + 16.0 * float(i)), 0.0), vec2(lmPx(3.5), lmPx(4.0))));
  // REC.
  float h = lmPx(30.0);
  vec2 dot_ = vec2(-ratio * 0.5 + 0.11, 0.5 - 0.115);
  float text = recDistance((p - (dot_ + vec2(lmPx(28.0), -h * 0.5))) / h) * h;
  d = min(d, text);
  float white = lmFill(d - stroke * 0.5);
  float red = lmFill(length(p - dot_) - lmPx(12.0)) * blink;
  float shadow = lmFill(min(d, length(p - dot_) - lmPx(12.0)) - stroke * 0.5 - lmPx(2.0), lmPx(6.0));
  return vec3(white, red, shadow);
}

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  float bell = sin(progress * PI);
  bell *= bell;
  float z = 1.0 + 0.22 * bell;
  vec2 shake = vec2(lmNoise(vec2(progress * 11.0, 1.3)), lmNoise(vec2(progress * 11.0, 6.1))) * lmPx(10.0) * bell;
  vec2 q = (uv - 0.5) / z + 0.5 + shake / vec2(ratio, 1.0);
  // O foco caça no meio (desfoque de lente) e a troca acontece escondida nele.
  float fx = (progress - 0.5) / 0.065;
  float focus = lmPx(22.0) * exp(-fx * fx);
  float m = smoothstep(0.46, 0.54, progress);
  vec3 lin = vec3(0.0);
  if (m < 1.0) lin += lmToLinear(lmDiskBlurFrom(q, focus).rgb) * (1.0 - m);
  if (m > 0.0) lin += lmToLinear(lmDiskBlurTo(q, focus).rgb) * m;
  vec3 col = lmToSrgb(lin);

  float show = smoothstep(0.0, 0.12, progress) * (1.0 - smoothstep(0.88, 1.0, progress));
  float blink = smoothstep(0.3, 0.7, 0.5 + 0.5 * cos(progress * 6.0 * PI));
  vec3 vf = viewfinder(lmCentered(uv), blink) * show;
  col *= 1.0 - 0.45 * vf.z;
  col = mix(col, vec3(0.97), vf.x);
  col = mix(col, vec3(0.95, 0.12, 0.1), vf.y);
  return vec4(col, 1.0);
}
