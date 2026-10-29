vec4 transition(vec2 uv) {
  float d = getFromDepth(uv);
  if (sentido > 0.5) d = 1.0 - d;
  // Um plano que anda do longe (0) para o perto (1): o que ficou atrás dele já é o próximo clipe.
  float w = suavidade;
  float front = mix(-w, 1.0 + w, progress);
  float reveal = 1.0 - smoothstep(front - w, front + w, d);
  // Brilho na passagem do plano, como luz atravessando neblina.
  float band = 1.0 - smoothstep(0.0, w * 1.5, abs(d - front));
  vec4 col = mix(getFromColor(uv), getToColor(uv), reveal);
  col.rgb += cor * band * brilho * 0.6 * (1.0 - smoothstep(0.85, 1.0, progress));
  return col;
}
