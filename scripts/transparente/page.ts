// Teste da exportação com fundo transparente (só para quem desenvolve; quem chama é scripts/transparente/run.cjs).
// Monta um projeto pequeno com uma imagem com transparência na trilha principal (sobram barras dos lados), uma
// camada semitransparente por cima, um efeito e um título; exporta em WebM (VP9 com alfa) e na sequência PNG,
// lê os arquivos de volta com o Mediabunny / o navegador e confere os pixels: transparentes, opacos e as bordas.
import { ALL_FORMATS, BlobSource, CanvasSink, Input } from 'mediabunny';
import { exportProject, type ExportSettings } from '../../src/media/exporter';
import { assets } from '../../src/media/assets';
import {
  createOverlayClip,
  createProject,
  createVideoClip,
  insertVideoClips,
  addVideoTrack,
  layoutProject,
  resolveFrame,
  type MediaItem,
  type Project,
} from '../../src/project/model';
import { createTextClip, TEXT_PRESETS } from '../../src/project/text';
import { createCamera } from '../../src/project/camera';
import { assetUrl } from '../../src/assetUrl';

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

const W = 640;
const H = 360;

/** Imagem 360×360: quadrado azul opaco no meio, o resto transparente. */
async function squareImage(): Promise<{ media: MediaItem; bitmap: ImageBitmap }> {
  const c = new OffscreenCanvas(360, 360);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgb(30, 80, 255)';
  ctx.fillRect(90, 90, 180, 180);
  return image('quadrado', c);
}

/** Camada: círculo vermelho puro com 50% de transparência. */
async function circleImage(): Promise<{ media: MediaItem; bitmap: ImageBitmap }> {
  const c = new OffscreenCanvas(200, 200);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
  ctx.beginPath();
  ctx.arc(100, 100, 90, 0, Math.PI * 2);
  ctx.fill();
  return image('circulo', c);
}

async function image(name: string, c: OffscreenCanvas): Promise<{ media: MediaItem; bitmap: ImageBitmap }> {
  const blob = await c.convertToBlob({ type: 'image/png' });
  const bitmap = await createImageBitmap(blob, { premultiplyAlpha: 'none' });
  const media: MediaItem = {
    id: name,
    kind: 'image',
    name: `${name}.png`,
    file: new File([blob], `${name}.png`, { type: 'image/png' }),
    url: '',
    thumbnail: null,
    duration: 5,
    width: c.width,
    height: c.height,
    hasAudio: false,
  };
  assets.bitmaps.set(media.id, bitmap);
  return { media, bitmap };
}

async function buildProject(withEffect: boolean): Promise<Project> {
  const square = await squareImage();
  const circle = await circleImage();
  let project: Project = { ...createProject(), name: 'teste transparente', width: W, height: H, fps: 30 };
  project = { ...project, media: [square.media, circle.media] };
  const main = { ...createVideoClip(square.media), trimOut: 1 };
  // Um efeito no clipe principal (o alfa tem que passar por ele).
  if (withEffect) main.effects = [{ uid: 'fx1', pluginId: 'effects/brilho', enabled: true, params: {} }];
  project = insertVideoClips(project, [main]);
  project = addVideoTrack(project);
  // Camada no canto de cima à esquerda (fora do quadrado azul e por cima da barra transparente).
  const overlay = { ...createOverlayClip(circle.media, 0, { x: 0.15, y: 0.25, scale: 0.4, radius: 0 }), trimOut: 1 };
  project = { ...project, videoTracks: project.videoTracks.map((t, i) => (i === 0 ? { ...t, clips: [overlay] } : t)) };
  const title = { ...createTextClip(TEXT_PRESETS[0], 0, 1), text: 'LUMIAR', x: 0.5, y: 0.85, animIn: 'none' as const, animOut: 'none' as const };
  // Sem sombra: a borda das letras tem que ser branca semitransparente (franja escura = alfa tratado errado).
  title.style = { ...title.style, color: '#ffffff', size: 0.12, shadow: 0 };
  project = { ...project, textTracks: project.textTracks.map((t, i) => (i === 0 ? { ...t, clips: [title] } : t)) };
  return project;
}

/** Pixels de um quadro (RGBA sem pré-multiplicar). */
type Pixels = { data: Uint8ClampedArray; width: number; height: number };
const at = (p: Pixels, x: number, y: number) => {
  const i = (Math.round(y) * p.width + Math.round(x)) * 4;
  return [p.data[i], p.data[i + 1], p.data[i + 2], p.data[i + 3]];
};

/** O quadro sobre um xadrez cinza (para olhar a transparência), em JPEG. */
async function onChecker(p: Pixels): Promise<string> {
  const c = new OffscreenCanvas(p.width, p.height);
  const ctx = c.getContext('2d')!;
  for (let y = 0; y < p.height; y += 16) for (let x = 0; x < p.width; x += 16) {
    ctx.fillStyle = (x + y) % 32 ? '#9a9a9a' : '#d0d0d0';
    ctx.fillRect(x, y, 16, 16);
  }
  const layer = new OffscreenCanvas(p.width, p.height);
  layer.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(p.data), p.width, p.height), 0, 0);
  ctx.drawImage(layer, 0, 0);
  const bytes = new Uint8Array(await (await c.convertToBlob({ type: 'image/jpeg', quality: 0.92 })).arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function readCanvas(canvas: HTMLCanvasElement | OffscreenCanvas): Pixels {
  const ctx = (canvas as OffscreenCanvas).getContext('2d') as OffscreenCanvasRenderingContext2D;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { data: img.data, width: img.width, height: img.height };
}

async function decodeWebm(blob: Blob, time: number): Promise<{ pixels: Pixels; transparentTrack: boolean; codec: string | null }> {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) });
  const track = (await input.getPrimaryVideoTrack())!;
  const transparentTrack = await track.canBeTransparent();
  const sink = new CanvasSink(track, { alpha: true, poolSize: 0 });
  const wrapped = (await sink.getCanvas(time))!;
  const pixels = readCanvas(wrapped.canvas);
  const codec = track.codec;
  input.dispose();
  return { pixels, transparentTrack, codec };
}

/** O PNG número `index` de dentro do .zip (sem compressão: os bytes estão inteiros depois de cada cabeçalho). */
async function pngAt(zip: Blob, index = 0): Promise<{ pixels: Pixels; count: number; name: string }> {
  const bytes = new Uint8Array(await zip.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const end = bytes.length - 22;
  const count = view.getUint16(end + 10, true);
  let p = 0;
  for (let i = 0; i < index; i++) p += 30 + view.getUint16(p + 26, true) + view.getUint32(p + 18, true);
  const nameLength = view.getUint16(p + 26, true);
  const size = view.getUint32(p + 18, true);
  const name = new TextDecoder().decode(bytes.subarray(p + 30, p + 30 + nameLength));
  const png = new Blob([bytes.subarray(p + 30 + nameLength, p + 30 + nameLength + size)], { type: 'image/png' });
  const bitmap = await createImageBitmap(png, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const c = new OffscreenCanvas(bitmap.width, bitmap.height);
  c.getContext('2d')!.drawImage(bitmap, 0, 0);
  return { pixels: readCanvas(c), count, name };
}

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

/** As mesmas conferências para o WebM e o PNG (tolerância maior no vídeo, que comprime). */
function checkFrame(label: string, p: Pixels, tol: number, opaque = false): Check[] {
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, value: number[]) => checks.push({ name: `${label}: ${name}`, ok, detail: `rgba(${value.join(', ')})` });
  // Barra dos lados (fora da imagem) e canto transparente da imagem.
  const bar = at(p, 20, 180);
  add(opaque ? 'barra do lado preta e opaca' : 'barra do lado transparente', opaque ? bar[3] === 255 && bar[0] < 8 : bar[3] <= 4, bar);
  const corner = at(p, 160, 330);
  add(opaque ? 'parte transparente da imagem opaca' : 'parte transparente da imagem transparente', opaque ? corner[3] === 255 : corner[3] <= 4, corner);
  // Quadrado azul opaco (com o efeito de brilho: continua azul e opaco).
  const blue = at(p, 320, 180);
  add('quadrado azul opaco', blue[3] >= 250 && blue[2] > 180 && blue[0] < 120, blue);
  // Círculo vermelho a 50% (straight: vermelho cheio, alfa ~128; escuro = alfa pré-multiplicado errado).
  const red = at(p, 0.15 * W, 0.25 * H);
  // Sem transparência a camada ignora o alfa da própria imagem (como sempre foi): só confere que é opaca.
  add(
    opaque ? 'círculo vermelho opaco' : 'círculo vermelho 50% sem escurecer',
    opaque ? red[3] === 255 && red[0] > 100 : near(red[3], 128, tol) && red[0] >= 255 - tol && red[1] <= tol && red[2] <= tol,
    red,
  );
  if (!opaque) {
    // Borda do título: pixels meio transparentes devem ser brancos (sem franja escura).
    let sum = 0;
    let n = 0;
    let min = 255;
    for (let y = Math.round(0.72 * H); y < Math.round(0.98 * H); y++) {
      for (let x = 150; x < 490; x++) {
        const v = at(p, x, y);
        if (v[3] > 30 && v[3] < 220) {
          const l = (v[0] + v[1] + v[2]) / 3;
          sum += l;
          n++;
          min = Math.min(min, l);
        }
      }
    }
    const mean = n ? sum / n : 0;
    checks.push({ name: `${label}: borda do título sem franja escura`, ok: n > 20 && mean > 255 - tol * 3, detail: `${n} pixels de borda, brilho médio ${mean.toFixed(1)}, mínimo ${min.toFixed(0)}` });
    const inside = at(p, 0.5 * W, 0.85 * H);
    checks.push({ name: `${label}: algo do título opaco`, ok: true, detail: `centro do título rgba(${inside.join(', ')})` });
  }
  return checks;
}

export async function run(): Promise<{ checks: Check[]; sizes: Record<string, number>; files: Record<string, string> }> {
  const checks: Check[] = [];
  const sizes: Record<string, number> = {};
  const files: Record<string, string> = {};
  const settings = (format: ExportSettings['format'], transparent: boolean): ExportSettings => ({ format, height: null, fps: null, quality: 'high', range: null, transparent });
  const toBase64 = async (blob: Blob) => {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  };

  const project = await buildProject(true);
  const webm = await exportProject(project, settings('webm', true));
  sizes.webm = webm.size;
  files['transparente.webm'] = await toBase64(webm);
  const decoded = await decodeWebm(webm, 0.5);
  checks.push({ name: 'WebM: trilha marcada como transparente', ok: decoded.transparentTrack, detail: `codec ${decoded.codec}` });
  checks.push(...checkFrame('WebM', decoded.pixels, 14));
  files['webm-xadrez.jpg'] = await onChecker(decoded.pixels);

  const zip = await exportProject(project, settings('png', true));
  sizes.zip = zip.size;
  files['transparente.zip'] = await toBase64(zip);
  const png = await pngAt(zip);
  checks.push({ name: 'PNG: 30 quadros no .zip', ok: png.count === 30, detail: `${png.count} arquivos, primeiro "${png.name}"` });
  checks.push(...checkFrame('PNG', png.pixels, 3));
  files['png-xadrez.jpg'] = await onChecker(png.pixels);

  // Transição (dissolver) entre a imagem do quadrado e a do círculo: no meio dela o fundo continua transparente.
  const square = await squareImage();
  const circle = await circleImage();
  let cut: Project = { ...createProject(), name: 'transicao', width: W, height: H, fps: 30, media: [square.media, circle.media] };
  cut = insertVideoClips(cut, [
    { ...createVideoClip(square.media), trimOut: 1 },
    { ...createVideoClip(circle.media), trimOut: 1 },
  ]);
  const timeline = layoutProject(cut);
  let middle = 0;
  for (let k = 0; k < timeline.duration * 30; k++) {
    const progress = resolveFrame(cut, timeline, k / 30).transition?.progress ?? -1;
    if (Math.abs(progress - 0.5) < Math.abs((resolveFrame(cut, timeline, middle / 30).transition?.progress ?? -1) - 0.5)) middle = k;
  }
  const mid = await pngAt(await exportProject(cut, settings('png', true)), middle);
  files['transicao-xadrez.jpg'] = await onChecker(mid.pixels);
  const outside = at(mid.pixels, 150, 180);
  checks.push({ name: 'Transição: fora das duas imagens, transparente', ok: outside[3] <= 4, detail: `quadro ${middle}: rgba(${outside.join(', ')})` });
  const both = at(mid.pixels, 320, 180);
  checks.push({ name: 'Transição: no meio, mistura visível', ok: both[3] >= 128 && both[3] < 255 && both[0] + both[2] > 150, detail: `rgba(${both.join(', ')})` });

  // Boomerang: na volta (quadros guardados e desenhados de novo) o fundo continua transparente, sem acumular.
  const loop = await exportProject(project, { ...settings('png', true), loop: 'boomerang', range: { start: 0, end: 0.5 } });
  const back = await pngAt(loop, 20);
  const backBar = at(back.pixels, 20, 180);
  const backRed = at(back.pixels, 0.15 * W, 0.25 * H);
  checks.push({
    name: 'Boomerang: volta com fundo transparente',
    ok: back.count > 15 && backBar[3] <= 4 && Math.abs(backRed[3] - 128) <= 4,
    detail: `${back.count} quadros; barra rgba(${backBar.join(', ')}), círculo rgba(${backRed.join(', ')})`,
  });

  // A pessoa recortada (Remover o fundo → Recortar, com o modelo do MediaPipe que vem no app).
  const blob = await (await fetch(assetUrl('previews/retrato.jpg'))).blob();
  const bitmap = await createImageBitmap(blob);
  const portrait: MediaItem = { ...square.media, id: 'retrato', name: 'retrato.jpg', file: new File([blob], 'retrato.jpg'), width: bitmap.width, height: bitmap.height };
  assets.bitmaps.set(portrait.id, bitmap);
  let person: Project = { ...createProject(), name: 'pessoa', width: W, height: H, fps: 30, media: [portrait] };
  person = insertVideoClips(person, [{ ...createVideoClip(portrait), trimOut: 0.2, matte: { mode: 'cut', color: '#000000' }, camera: { ...createCamera(), fill: true } }]);
  const cutout = await pngAt(await exportProject(person, settings('png', true)), 3);
  files['pessoa-xadrez.jpg'] = await onChecker(cutout.pixels);
  let transparentPixels = 0;
  let opaquePixels = 0;
  for (let i = 3; i < cutout.pixels.data.length; i += 4) {
    if (cutout.pixels.data[i] <= 4) transparentPixels++;
    else if (cutout.pixels.data[i] >= 250) opaquePixels++;
  }
  const total = cutout.pixels.data.length / 4;
  checks.push({
    name: 'Pessoa recortada: fundo transparente e pessoa opaca',
    ok: transparentPixels > total * 0.15 && opaquePixels > total * 0.15,
    detail: `${Math.round((transparentPixels / total) * 100)}% transparente, ${Math.round((opaquePixels / total) * 100)}% opaco`,
  });

  // O mesmo projeto sem transparência continua como antes (barras pretas e opaco).
  const opaque = await exportProject(project, settings('webm', false));
  const decodedOpaque = await decodeWebm(opaque, 0.5);
  checks.push({ name: 'WebM opaco: sem alfa', ok: !decodedOpaque.transparentTrack, detail: `codec ${decodedOpaque.codec}` });
  checks.push(...checkFrame('WebM opaco', decodedOpaque.pixels, 14, true));
  return { checks, sizes, files };
}
