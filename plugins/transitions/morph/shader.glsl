// Baseado em "morph" do gl-transitions (MIT)
vec4 transition(vec2 p) {
  vec4 ca = getFromColor(p);
  vec4 cb = getToColor(p);
  vec2 oa = vec2((ca.r + ca.b) * 0.5, (ca.g + ca.b) * 0.5) * 2.0 - 1.0;
  vec2 ob = vec2((cb.r + cb.b) * 0.5, (cb.g + cb.b) * 0.5) * 2.0 - 1.0;
  vec2 oc = mix(oa, ob, 0.5) * strength;
  return mix(getFromColor(p + oc * progress), getToColor(p - oc * (1.0 - progress)), progress);
}
