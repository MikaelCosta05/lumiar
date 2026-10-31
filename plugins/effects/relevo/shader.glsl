// Relevo (alto-relevo de metal ou papel): a luminância vira um mapa de altura, as normais saem de um Sobel sobre
// uma versão levemente suavizada (sem chuvisco) e a superfície é iluminada de cima à esquerda (difusa + um brilho
// especular de metal). Onde é plano fica exatamente no cinza médio, como no relevo clássico, e os degraus mínimos
// da compressão do vídeo (blocos numa parede lisa) ficam abaixo do piso de ruído e não aparecem.
float h(vec2 uv, float lod) { return lmLuma(getColorLod(uv, lod).rgb); }

vec4 effect(vec2 uv) {
  float k = resolution.y / 1080.0;
  float lod = max(log2(1.2 * k), 0.0);
  vec2 px = lmPxUv(1.5);
  float tl = h(uv + vec2(-px.x, px.y), lod), t = h(uv + vec2(0.0, px.y), lod), tr = h(uv + px, lod);
  float l = h(uv - vec2(px.x, 0.0), lod), r = h(uv + vec2(px.x, 0.0), lod);
  float bl = h(uv - px, lod), b = h(uv - vec2(0.0, px.y), lod), br = h(uv + vec2(px.x, -px.y), lod);
  float gx = (tr + 2.0 * r + br - tl - 2.0 * l - bl) * 0.125;
  float gy = (tl + 2.0 * t + tr - bl - 2.0 * b - br) * 0.125;
  // Piso de ruído: degraus de 1 ou 2 níveis (os blocos da compressão do vídeo numa parede lisa) não viram relevo;
  // o que é forma de verdade passa inteiro.
  vec2 g = vec2(gx, gy);
  float gl = length(g);
  g *= smoothstep(0.0015, 0.005, gl);
  gx = g.x;
  gy = g.y;
  vec3 n = normalize(vec3(-gx * strength * 2.4, -gy * strength * 2.4, 1.0));
  vec3 L = normalize(vec3(-0.55, 0.6, 0.58));
  float diffuse = dot(n, L) - L.z;                   // 0 no plano
  // Brilho especular (metal) só o que passa do brilho do plano.
  float spec = max(pow(max(reflect(-L, n).z, 0.0), 40.0) - pow(max(reflect(-L, vec3(0.0, 0.0, 1.0)).z, 0.0), 40.0), 0.0);
  float shade = clamp(0.5 + diffuse * 0.9 + spec * 0.35, 0.0, 1.0);
  vec3 c = getColor(uv).rgb;
  return vec4(mix(vec3(shade), clamp(c * (shade + 0.5) + spec * 0.2, 0.0, 1.0), colorful), 1.0);
}
