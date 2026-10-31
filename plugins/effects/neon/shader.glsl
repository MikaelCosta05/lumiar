// Contorno neon: as bordas da imagem viram tubos de luz.
// - Bordas por Sobel lido num nível de detalhe do tamanho da espessura (já sem o chuvisco de pixel), com limiar
//   suave: textura fraca (pele, parede) não acende, só contornos de verdade.
// - Duas escalas: o tubo (fino, com o miolo quase branco de tão quente) e o halo largo (o mesmo Sobel num nível
//   bem mais borrado), somados como luz em luz linear e com as altas luzes comprimidas.
// Espessura em px de um vídeo 1080p.
float sobel(vec2 uv, vec2 px, float lod) {
  float tl = lmLuma(getColorLod(uv + px * vec2(-1.0, 1.0), lod).rgb);
  float t = lmLuma(getColorLod(uv + px * vec2(0.0, 1.0), lod).rgb);
  float tr = lmLuma(getColorLod(uv + px * vec2(1.0, 1.0), lod).rgb);
  float l = lmLuma(getColorLod(uv + px * vec2(-1.0, 0.0), lod).rgb);
  float r = lmLuma(getColorLod(uv + px * vec2(1.0, 0.0), lod).rgb);
  float bl = lmLuma(getColorLod(uv + px * vec2(-1.0, -1.0), lod).rgb);
  float b = lmLuma(getColorLod(uv + px * vec2(0.0, -1.0), lod).rgb);
  float br = lmLuma(getColorLod(uv + px * vec2(1.0, -1.0), lod).rgb);
  float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
  float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
  return length(vec2(gx, gy)) * 0.25;
}

vec4 effect(vec2 uv) {
  float k = resolution.y / 1080.0;
  float th = max(thickness, 0.5);
  float e = sobel(uv, lmPxUv(th), max(log2(th * k * 0.8), 0.0));
  float tube = smoothstep(0.035, 0.16, e);
  float wide = sobel(uv, lmPxUv(th * 5.0), max(log2(th * k * 4.0), 0.0));
  float halo = smoothstep(0.02, 0.14, wide);

  vec4 c = getColor(uv);
  vec3 base = lmToLinear(c.rgb * (1.0 - darken));
  vec3 neon = lmToLinear(tint);
  // O miolo do tubo tende ao branco (o gás mais quente), a cor fica nas bordas e no halo.
  vec3 light = neon * (tube * 1.6 + halo * 0.45) + vec3(1.0) * pow(tube, 3.0) * 0.45;
  vec3 col = lmToSrgb(base + light);
  return vec4(lmSoftClip(col, 0.8), c.a);
}
