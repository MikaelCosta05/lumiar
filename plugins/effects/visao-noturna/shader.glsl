// Visão noturna (intensificador de imagem, geração 3, fósforo verde P43).
// - O tubo amplifica a luz e satura de forma suave nas altas luzes (nada de branco chapado); luzes fortes ganham o
//   halo típico dos óculos (brilho por níveis).
// - Cintilação do tubo: ruído gaussiano fino, um quadro novo a 30 por segundo, bem mais forte nas sombras, e
//   pontinhos claros raros (os "scintillation" de alto ganho). O tamanho do grão é de 1080p.
// - Textura de colmeia da placa de fibras, bem de leve, e a imagem um pouco mole (resolução do tubo).
// - Máscara de binóculo: dois círculos que se cruzam, com borda suave e vinheta dentro de cada tubo.
vec4 effect(vec2 uv) {
  float k = resolution.y / 1080.0;
  vec3 c = getColorLod(uv, max(log2(1.6 * k), 0.0)).rgb;
  float lin = lmLuma(lmToLinear(c));
  float v = 1.0 - exp(-lin * gain * 2.2);
  v += lmLuma(lmBloom(uv, 0.55, 0.55)) * gain * 0.6;

  float frame = floor(time * 30.0);
  vec2 g = floor(uv * resolution / max(1.4 * k, 1.0));
  float dark = 1.0 - clamp(v, 0.0, 1.0);
  v += lmGaussianNoise(vec3(g, frame)) * grain * 0.17 * (0.35 + 0.65 * dark);
  v += step(0.9993, lmHash(vec3(g, frame + 0.5))) * grain * 0.6 * dark;

  // Colmeia da placa de microcanais (~6 px de 1080p).
  vec2 hp = lmCentered(uv) * 1080.0 / 6.0;
  vec2 r = vec2(1.0, 1.7320508);
  vec2 a = mod(hp, r) - r * 0.5;
  vec2 b = mod(hp - r * 0.5, r) - r * 0.5;
  vec2 hc = dot(a, a) < dot(b, b) ? a : b;
  float hex = smoothstep(0.32, 0.5, max(dot(abs(hc), normalize(r)), abs(hc).x));
  v *= 1.0 - 0.05 * hex;

  v = clamp(v, 0.0, 1.2);
  vec3 phosphor = mix(vec3(0.12, 1.0, 0.3), vec3(0.8, 1.0, 0.75), smoothstep(0.75, 1.15, v));
  vec3 col = lmSoftClip(phosphor * v, 0.85);

  // Binóculo.
  vec2 p = lmCentered(uv);
  float dl = length(p - vec2(-0.32, 0.0));
  float dr = length(p - vec2(0.32, 0.0));
  float d = min(dl, dr);
  float mask = 1.0 - smoothstep(0.445, 0.475, d);
  float tubeVig = 1.0 - 0.35 * smoothstep(0.2, 0.47, d);
  col *= mix(1.0, mask * tubeVig, binocular);
  return vec4(col, 1.0);
}
