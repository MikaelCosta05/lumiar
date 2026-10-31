// Onda de choque: um clarão no centro solta um anel de pressão que se expande rápido e vai freando. O anel
// refrata a imagem (deslocamento radial com o perfil da derivada de uma gaussiana: puxa à frente e empurra atrás),
// separa as cores como uma lente grossa e brilha de leve; atrás da frente da onda já está o próximo clipe. A força
// da onda se dissipa conforme ela cresce. Tudo com a proporção certa (o anel é um círculo) e em luz linear.

vec2 mirrorUv(vec2 p) { return 1.0 - abs(1.0 - mod(p, 2.0)); }

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  vec2 p = lmCentered(uv);
  float d = length(p);
  vec2 dir = p / max(d, 1e-5);
  float r = 1.35 * (1.0 - pow(1.0 - progress, 1.6));  // rápida no início, freando
  float w = 0.035 + 0.09 * progress;
  float decay = pow(1.0 - progress, 1.5);
  float x = (d - r) / w;
  float g = exp(-x * x);
  float profile = -x * g * 1.6487;  // derivada da gaussiana, pico = 1
  float amp = 0.06 * strength * decay;
  // Cada canal desvia um pouco mais (dispersão): o anel ganha franja de cor.
  vec2 o = dir * amp * profile / vec2(ratio, 1.0);
  float m = 1.0 - smoothstep(r - 0.7 * w, r + 0.2 * w, d);
  vec3 col;
  if (m <= 0.0) {
    col = vec3(lmToLinear(getFromColor(mirrorUv(uv + o)).rgb).r, lmToLinear(getFromColor(mirrorUv(uv + o * 1.12)).rgb).g, lmToLinear(getFromColor(mirrorUv(uv + o * 1.25)).rgb).b);
  } else if (m >= 1.0) {
    col = vec3(lmToLinear(getToColor(mirrorUv(uv + o)).rgb).r, lmToLinear(getToColor(mirrorUv(uv + o * 1.12)).rgb).g, lmToLinear(getToColor(mirrorUv(uv + o * 1.25)).rgb).b);
  } else {
    vec3 a = vec3(lmToLinear(getFromColor(mirrorUv(uv + o)).rgb).r, lmToLinear(getFromColor(mirrorUv(uv + o * 1.12)).rgb).g, lmToLinear(getFromColor(mirrorUv(uv + o * 1.25)).rgb).b);
    vec3 b = vec3(lmToLinear(getToColor(mirrorUv(uv + o)).rgb).r, lmToLinear(getToColor(mirrorUv(uv + o * 1.12)).rgb).g, lmToLinear(getToColor(mirrorUv(uv + o * 1.25)).rgb).b);
    col = mix(a, b, m);
  }
  // Brilho do anel e o clarão inicial no centro, somados como luz.
  vec3 light = vec3(0.85, 0.92, 1.0) * g * 0.22 * strength * decay;
  light += vec3(1.0, 0.95, 0.85) * exp(-d * 5.0) * exp(-progress * 14.0) * smoothstep(0.0, 0.03, progress) * 1.2 * min(strength, 1.0);
  col = lmToSrgb(col + light);
  // Comprime as altas luzes só onde há luz somada (fora dela a imagem fica intacta).
  return vec4(mix(col, lmSoftClip(col, 0.85), clamp(max(light.r, max(light.g, light.b)) * 8.0, 0.0, 1.0)), 1.0);
}
