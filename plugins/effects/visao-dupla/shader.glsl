// Visão dupla (tontura): duas cópias que se afastam e voltam, uma puxando para o vermelho e outra para o azul.
// A mistura é feita em luz linear e normalizada (o branco continua branco, sem o brilho a mais de antes) e o que
// sai do quadro é lido espelhado.
vec2 mirrorUv(vec2 p) { return 1.0 - abs(1.0 - mod(p, 2.0)); }

vec4 effect(vec2 uv) {
  vec2 off = vec2(sin(time * speed), cos(time * speed * 0.7)) * amount * 0.03;
  vec3 a = lmToLinear(getColor(mirrorUv(uv + off)).rgb);
  vec3 b = lmToLinear(getColor(mirrorUv(uv - off)).rgb);
  vec3 wa = vec3(1.1, 0.75, 0.75);
  vec3 wb = vec3(0.75, 0.95, 1.15);
  return vec4(lmToSrgb((a * wa + b * wb) / (wa + wb)), 1.0);
}
