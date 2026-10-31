// Gota de tinta na água: o próximo clipe se espalha do centro (mais duas gotas menores que nascem depois e se
// juntam) com a borda orgânica de fbm que evolui com o tempo, como pigmento se abrindo. À frente da borda, uma
// nuvem de tinta escura e fiapada tinge o clipe atual; perto dela, a água refrata um pouco a imagem.
// "Detalhe" = escala do ruído da borda.

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  vec2 a = lmCentered(uv);
  float R = 0.5 * length(vec2(ratio, 1.0));
  float t = progress * 0.9;
  // Borda que muda com o tempo (z = tempo), com um segundo nível de fiapos mais finos.
  float n = lmFbm(vec3(a * scale + 3.0, t), 4);
  float fine = lmFbm(vec3(a * scale * 3.1 + 9.0, t * 1.7), 2);
  float dMain = length(a) / R + 0.32 * n + 0.06 * fine;
  // Gotas menores, que começam mais tarde (o + 0,3 é o atraso) e se fundem na grande.
  float d1 = length(a - vec2(-0.21 * ratio, 0.18)) / (R * 0.55) + 0.32 * n + 0.3;
  float d2 = length(a - vec2(0.18 * ratio, -0.22)) / (R * 0.5) + 0.32 * n + 0.45;
  float d = min(dMain, min(d1, d2));

  const float feather = 0.035;
  const float cloudW = 0.16;
  float e = mix(-0.3 - cloudW, 1.3 + feather, lmEaseInOutSine(progress));
  float m = 1.0 - smoothstep(e - feather, e, d);
  // Refração da água perto da frente.
  float nearFront = 1.0 - smoothstep(0.0, 0.12, abs(d - e));
  vec2 bend = vec2(0.0);
  if (nearFront > 0.0) bend = vec2(lmNoise(a * 9.0 + t * 2.0), lmNoise(a * 9.0 + 5.2 - t * 2.0)) * lmPx(9.0) * nearFront;
  vec4 from = getFromColor(uv + bend);
  vec4 to = getToColor(uv + bend * 0.5);
  // Nuvem de tinta: mais densa colada na borda, fiapada pelo ruído fino, multiplica o clipe atual.
  float cloud = pow(1.0 - smoothstep(e, e + cloudW, d), 1.5) * (1.0 - m);
  cloud *= smoothstep(-0.6, 0.4, fine + 0.3);
  vec3 ink = vec3(0.07, 0.07, 0.11);
  from.rgb = mix(from.rgb, from.rgb * ink, cloud * 0.85);
  // Do lado de dentro, uma sombra leve de tinta que ainda está se dissolvendo.
  float inside = (1.0 - smoothstep(e - feather - 0.08, e - feather, d)) * m;
  to.rgb *= 1.0 - 0.25 * (m - inside);
  return vec4(mix(from.rgb, to.rgb, m), mix(from.a, to.a, m));
}
