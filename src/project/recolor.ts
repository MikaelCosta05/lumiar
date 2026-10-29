/**
 * Trocar a cor de um objeto: a conta de cor, em TypeScript, igual à do shader
 * (plugins/effects/trocar-cor-objeto/shader.glsl), para dar para testar.
 *
 * Tudo no OKLab, que separa bem a luz (L) da cor (a, b): cada pixel fica com a própria luz (as sombras,
 * os brilhos e a textura continuam lá) e ganha o matiz e a saturação da cor escolhida. Pixels que
 * não cabem na tela com essa luz (um amarelo muito escuro, um azul muito claro) perdem saturação até
 * caber, em vez de estourar.
 */

export type Rgb = [number, number, number];

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

/** sRGB (0 a 1) → OKLab. */
export function rgbToOklab([r, g, b]: Rgb): Rgb {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLab → sRGB linear (sem cortar: fora de 0 a 1 = fora da tela). */
function oklabToLinear([L, a, b]: Rgb): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** OKLab → sRGB (0 a 1, cortado). */
export function oklabToRgb(lab: Rgb): Rgb {
  return oklabToLinear(lab).map((c) => toGamma(Math.min(1, Math.max(0, c)))) as Rgb;
}

const inGamut = (c: Rgb) => c.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

/** Croma (saturação no OKLab) e matiz (radianos). */
export function chromaHue(lab: Rgb): { chroma: number; hue: number } {
  return { chroma: Math.hypot(lab[1], lab[2]), hue: Math.atan2(lab[2], lab[1]) };
}

export interface RecolorOptions {
  /** 0 a 2: multiplica a saturação da cor escolhida */
  saturation: number;
  /** -0,5 a 0,5: soma na luz do pixel */
  brightness: number;
}

/**
 * A cor nova de um pixel: luz do pixel (+ brilho), matiz e croma da cor escolhida (vezes a saturação),
 * com o croma reduzido até caber na tela. Mesmo passo a passo do shader (busca binária de 8 passos).
 */
export function recolorPixel(pixel: Rgb, target: Rgb, options: RecolorOptions): Rgb {
  const src = rgbToOklab(pixel);
  const tgt = chromaHue(rgbToOklab(target));
  const L = Math.min(1, Math.max(0, src[0] + options.brightness));
  const want = tgt.chroma * Math.max(0, options.saturation);
  const ca = Math.cos(tgt.hue);
  const sa = Math.sin(tgt.hue);
  const lab = (c: number): Rgb => [L, c * ca, c * sa];
  let chroma = want;
  if (!inGamut(oklabToLinear(lab(chroma)))) {
    let lo = 0;
    let hi = want;
    for (let i = 0; i < 8; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklabToLinear(lab(mid)))) lo = mid;
      else hi = mid;
    }
    chroma = lo;
  }
  return oklabToRgb(lab(chroma));
}

/**
 * Quanto um pixel parece pele (0 a 1): matiz entre o vermelho e o amarelo, saturação moderada e luz
 * média. Serve para "Proteger a pele" quando a máscara pega um pedaço do braço ou do rosto.
 */
export function skinLikeness(pixel: Rgb): number {
  const lab = rgbToOklab(pixel);
  const { chroma, hue } = chromaHue(lab);
  const deg = (hue * 180) / Math.PI;
  const band = (x: number, a: number, b: number, soft: number) => Math.min(smooth(a - soft, a, x), 1 - smooth(b, b + soft, x));
  return band(deg, 35, 80, 15) * band(chroma, 0.03, 0.16, 0.03) * band(lab[0], 0.35, 0.92, 0.08);
}

function smooth(a: number, b: number, x: number): number {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
}
