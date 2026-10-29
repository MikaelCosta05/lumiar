float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

vec3 toYiq(vec3 c) {
  return vec3(dot(c, vec3(0.299, 0.587, 0.114)), dot(c, vec3(0.596, -0.274, -0.322)), dot(c, vec3(0.211, -0.523, 0.312)));
}

vec3 toRgb(vec3 y) {
  return vec3(y.x + 0.956 * y.y + 0.621 * y.z, y.x - 0.272 * y.y - 0.647 * y.z, y.x - 1.106 * y.y + 1.703 * y.z);
}

vec4 effect(vec2 uv) {
  // Brilho (Y): um pouco mole na horizontal.
  float soft = maciez * 0.0035;
  float luma = 0.0;
  for (int i = -2; i <= 2; i++) {
    float w = 3.0 - abs(float(i));
    luma += toYiq(getColor(uv + vec2(float(i) * soft, 0.0)).rgb).x * w;
  }
  luma /= 9.0;

  // Cor (I e Q): bem borrada e chegando depois, como se escorresse para a direita.
  float spread = 0.002 + vazamento * 0.006;
  vec2 origin = uv - vec2(atraso * 0.012, 0.0);
  vec2 chroma = vec2(0.0);
  float total = 0.0;
  for (int i = -4; i <= 4; i++) {
    float w = 5.0 - abs(float(i));
    chroma += toYiq(getColor(origin + vec2(float(i) * spread, 0.0)).rgb).yz * w;
    total += w;
  }
  chroma /= total;

  // Manchas de cor que tremem em faixas horizontais.
  float t = floor(time * 30.0);
  vec2 n = vec2(vnoise(vec2(uv.x * 30.0, uv.y * 240.0 + t * 7.0)), vnoise(vec2(uv.x * 30.0 + 9.0, uv.y * 240.0 - t * 5.0))) - 0.5;
  chroma += n * ruidoCor * 0.12;

  return vec4(clamp(toRgb(vec3(luma, chroma)), 0.0, 1.0), 1.0);
}
