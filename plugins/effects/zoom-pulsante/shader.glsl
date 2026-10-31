// Zoom no ritmo: a cada batida a imagem dá um soco de zoom com subida curta (40 ms, sem salto de um quadro para o
// outro) e volta com queda exponencial. O desfoque de zoom acompanha a velocidade do movimento (obturador de 180° a
// 30 fps): borra na subida rápida e fica nítido quando assenta. O flash é luz somada em luz linear, sem estourar.

vec3 addLightSoft(vec3 base, vec3 light) {
  vec3 room = max(1.0 - base, 1e-4);
  return base + room * (1.0 - exp(-max(light, 0.0) / room));
}

float pulseAt(float t) {
  float beatSec = 60.0 / max(bpm, 1.0);
  float b = fract(t / beatSec);
  float attack = 0.04 / beatSec; // 40 ms em fração da batida
  return lmEaseOutCubic(clamp(b / attack, 0.0, 1.0)) * exp(-max(b - attack, 0.0) * 6.0);
}

vec4 effect(vec2 uv) {
  float pulse = pulseAt(time);
  float z = 1.0 + amount * pulse;
  float zA = 1.0 + amount * pulseAt(time - 1.0 / 120.0);
  float zB = 1.0 + amount * pulseAt(time + 1.0 / 120.0);
  vec2 d = uv - 0.5;
  // Quanto a imagem anda neste ponto durante o obturador (px).
  float lenPx = abs(1.0 / zA - 1.0 / zB) * length(d * vec2(ratio, 1.0)) * resolution.y;
  vec4 c;
  if (lenPx < 0.75) {
    c = getColor(0.5 + d / z);
  } else {
    int n = int(clamp(ceil(lenPx / 1.5), 2.0, 24.0));
    float jitter = lmIGN(gl_FragCoord.xy);
    c = vec4(0.0);
    for (int i = 0; i < 24; i++) {
      if (i >= n) break;
      float zz = mix(zA, zB, (float(i) + jitter) / float(n));
      vec4 s = getColor(0.5 + d / zz);
      s.rgb = lmToLinear(s.rgb);
      c += s;
    }
    c /= float(n);
    c.rgb = lmToSrgb(c.rgb);
  }
  if (flash > 0.0) {
    vec3 lin = lmToLinear(c.rgb);
    c.rgb = lmToSrgb(addLightSoft(lin, (lin * 1.4 + 0.04) * pulse * flash));
  }
  return c;
}
