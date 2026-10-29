import { describe, expect, it } from 'vitest';
import { getPlugin } from '../engine/registry';
import { addVideoTrack, createOverlayClip, createProject, createVideoClip, insertVideoClips, layoutProject, resolveFrame, toFrameInput, type MediaItem } from './model';
import {
  analysisFps,
  createGaze,
  displayPoint,
  EYE_VALUES,
  eyesFromLandmarks,
  GAZE_PLUGIN_ID,
  gazeAt,
  gazeEffect,
  gazeParams,
  isGaze,
  smoothGaze,
  usesGaze,
  type GazeFrame,
  type Landmark,
} from './gaze';

/** Um rosto de frente, sintético: olhos com 30 px, íris no lugar pedido (em frações da largura do olho). */
function face(opts: { irisDx?: number; irisDy?: number; open?: number; width?: number; height?: number } = {}): Landmark[] {
  const W = opts.width ?? 1000;
  const H = opts.height ?? 1000;
  const pts: Landmark[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  const set = (i: number, x: number, y: number) => (pts[i] = { x: x / W, y: y / H, z: 0 });
  const open = opts.open ?? 0.3;
  // Olho da direita da pessoa (à esquerda na imagem): canto de fora 33 em x=400, de dentro 133 em x=430.
  const eyes = [
    { outer: 33, inner: 133, x0: 400, up: [158, 159, 160], lo: [144, 145, 153], iris: 468, ring: [469, 470, 471, 472], out: -1 },
    { outer: 263, inner: 362, x0: 570, up: [385, 386, 387], lo: [373, 374, 380], iris: 473, ring: [474, 475, 476, 477], out: 1 },
  ];
  for (const e of eyes) {
    const y = 500;
    const outerX = e.out < 0 ? e.x0 : e.x0 + 30;
    const innerX = e.out < 0 ? e.x0 + 30 : e.x0;
    set(e.outer, outerX, y);
    set(e.inner, innerX, y);
    const mid = e.x0 + 15;
    e.up.forEach((i) => set(i, mid, y - (open * 30) / 2));
    e.lo.forEach((i) => set(i, mid, y + (open * 30) / 2));
    const ix = mid + (opts.irisDx ?? 0) * 30;
    const iy = y + (opts.irisDy ?? 0) * 30;
    set(e.iris, ix, iy);
    e.ring.forEach((i, k) => set(i, ix + Math.cos((k * Math.PI) / 2) * 7, iy + Math.sin((k * Math.PI) / 2) * 7));
  }
  set(10, 500, 380); // testa
  set(152, 500, 700); // queixo
  return pts;
}

describe('olhos a partir dos pontos do rosto', () => {
  it('acha cantos, íris, raio e um alvo perto do meio do olho', () => {
    const eyes = eyesFromLandmarks(face({ irisDy: 0.2 }), 1000, 1000)!;
    expect(eyes).toHaveLength(EYE_VALUES * 2);
    // Olho 0: canto de dentro (133) em 430, de fora (33) em 400.
    expect(eyes[0]).toBeCloseTo(0.43, 4);
    expect(eyes[2]).toBeCloseTo(0.4, 4);
    // Íris 20% da largura abaixo da linha dos cantos; raio 7/30.
    expect(eyes[9]).toBeCloseTo(0.506, 4);
    expect(eyes[10]).toBeCloseTo(7 / 30, 3);
    // Alvo: um pouco acima da linha dos cantos e um pouco para fora (rosto de frente).
    expect(eyes[12]).toBeLessThan(0.5);
    expect(eyes[12]).toBeGreaterThan(0.495);
    expect(eyes[11]).toBeLessThan(0.415);
    // Olho aberto: peso 1.
    expect(eyes[13]).toBeCloseTo(1, 3);
    expect(eyes[EYE_VALUES + 13]).toBeCloseTo(1, 3);
  });

  it('olho fechado ou piscando: peso 0', () => {
    expect(eyesFromLandmarks(face({ open: 0.05 }), 1000, 1000)![13]).toBe(0);
    expect(eyesFromLandmarks(face(), 1000, 1000, 0.9)![13]).toBe(0);
    // Meio fechado (sorrindo): peso parcial.
    const half = eyesFromLandmarks(face({ open: 0.135 }), 1000, 1000)![13];
    expect(half).toBeGreaterThan(0.2);
    expect(half).toBeLessThan(0.8);
  });

  it('a íris é ligada ao olho mais perto, qualquer que seja a ordem dos pontos', () => {
    const pts = face({ irisDx: 0.1 });
    [pts[468], pts[473]] = [pts[473], pts[468]];
    for (let k = 0; k < 4; k++) [pts[469 + k], pts[474 + k]] = [pts[474 + k], pts[469 + k]];
    const eyes = eyesFromLandmarks(pts, 1000, 1000)!;
    expect(eyes[8]).toBeCloseTo(0.418, 3);
    expect(eyes[EYE_VALUES + 8]).toBeCloseTo(0.588, 3);
  });

  it('sem os 478 pontos, nada', () => {
    expect(eyesFromLandmarks(face().slice(0, 468), 1000, 1000)).toBeNull();
  });
});

const frame = (t: number, iy: number, w = 1): GazeFrame => {
  const eye = [0.43, 0.5, 0.4, 0.5, 0.415, 0.495, 0.415, 0.505, 0.415, iy, 0.23, 0.414, 0.498, w];
  return { t, eyes: [...eye, ...eye.map((v, i) => (i % 2 === 0 && i < 13 && i !== 10 ? v + 0.17 : v))] };
};

describe('no tempo', () => {
  it('entre dois quadros, em linha reta; o peso é o menor dos dois', () => {
    const frames = [frame(0, 0.5, 1), frame(0.1, 0.51, 0.4)];
    const at = gazeAt(frames, 0.05)!;
    expect(at[9]).toBeCloseTo(0.505, 5);
    expect(at[13]).toBeCloseTo(0.4, 5);
  });

  it('fora dos quadros analisados ou num buraco grande: sem correção', () => {
    const frames = [frame(0, 0.5), frame(1 / 30, 0.5), frame(2, 0.5)];
    expect(gazeAt(frames, -1)).toBeNull();
    expect(gazeAt(frames, 3)).toBeNull();
    expect(gazeAt(frames, 1)![13]).toBe(0);
  });

  it('foto: um quadro vale o tempo todo', () => {
    expect(gazeAt([frame(0, 0.5)], 4)).not.toBeNull();
  });

  it('suavizar tira o tremido e a piscada derruba o peso dos vizinhos', () => {
    const frames = [0, 1, 2, 3, 4, 5, 6].map((i) => frame(i / 30, i % 2 ? 0.51 : 0.49, i === 3 ? 0 : 1));
    const smooth = smoothGaze(frames, 1 / 30);
    expect(Math.abs(smooth[2].eyes[9] - 0.5)).toBeLessThan(0.004);
    expect(smooth[2].eyes[13]).toBe(0);
    expect(smooth[4].eyes[13]).toBe(0);
    expect(smooth[0].eyes[13]).toBe(1);
  });

  it('analisa até 30 quadros por segundo, menos em clipes longos', () => {
    expect(analysisFps(10)).toBe(30);
    expect(analysisFps(600)).toBe(8);
    expect(analysisFps(240)).toBe(15);
  });
});

describe('efeito no renderizador', () => {
  it('o efeito interno está registrado, mas fora das bibliotecas', async () => {
    expect(getPlugin(GAZE_PLUGIN_ID)).toBeDefined();
    const { effectPlugins } = await import('../engine/registry');
    expect(effectPlugins.some((p) => p.id === GAZE_PLUGIN_ID)).toBe(false);
  });

  it('girar e espelhar levam os olhos junto (y para cima no shader)', () => {
    expect(displayPoint(0.2, 0.3, 0, false, false)).toEqual([0.2, 0.7]);
    expect(displayPoint(0.2, 0.3, 0, true, false)).toEqual([0.8, 0.7]);
    // 90° horário: o canto de cima à esquerda vai para cima à direita.
    expect(displayPoint(0, 0, 90, false, false)).toEqual([1, 1]);
    expect(displayPoint(0, 0, 270, false, false)).toEqual([0, 0]);
    expect(displayPoint(0.2, 0.3, 180, false, false).map((v) => Math.round(v * 1e6) / 1e6)).toEqual([0.8, 0.3]);
  });

  it('monta os parâmetros do instante, com a câmera e o encaixe', () => {
    const gaze = createGaze('m', [frame(0, 0.51), frame(0.1, 0.51)]);
    const params = gazeParams(gaze, 0.05, { width: 1920, height: 1080, camera: { zoom: 2, x: 0.4, y: 0.45, rotation: 90, fill: true } })!;
    expect(params.forca).toBe(gaze.strength);
    expect(params.aspecto).toBeCloseTo(1920 / 1080, 5);
    expect(params.encaixe).toBe(1);
    expect(params.camZoom).toBe(2);
    expect(params.camGiro).toBeCloseTo(Math.PI / 2, 5);
    expect(params.camEncher).toBe(1);
    expect(params.iris0).toEqual([0.415, 1 - 0.51]);
    expect(params.extra0).toEqual([0.23, 1]);
    expect(gazeParams(gaze, 0.05, { width: 100, height: 100, stretch: true })!.encaixe).toBe(0);
  });

  it('só entra no clipe com a correção ligada e da mesma mídia; olhos fechados = sem efeito', () => {
    const gaze = createGaze('m', [frame(0, 0.51), frame(0.1, 0.51)]);
    const media = { width: 1920, height: 1080 };
    expect(gazeEffect({ mediaId: 'm', gaze }, media, 0.05, null, false)?.pluginId).toBe(GAZE_PLUGIN_ID);
    expect(gazeEffect({ mediaId: 'outra', gaze }, media, 0.05, null, false)).toBeNull();
    expect(gazeEffect({ mediaId: 'm', gaze: { ...gaze, enabled: false } }, media, 0.05, null, false)).toBeNull();
    expect(gazeEffect({ mediaId: 'm' }, media, 0.05, null, false)).toBeNull();
    const closed = createGaze('m', [frame(0, 0.51, 0), frame(0.1, 0.51, 0)]);
    expect(gazeEffect({ mediaId: 'm', gaze: closed }, media, 0.05, null, false)).toBeNull();
    expect(usesGaze({ mediaId: 'm', gaze: { ...gaze, frames: [] } })).toBe(false);
  });

  it('projeto estragado não quebra', () => {
    expect(isGaze(null)).toBe(false);
    expect(isGaze({ frames: [{ t: 0, eyes: [1, 2] }] })).toBe(false);
    expect(isGaze(createGaze('m', [frame(0, 0.5)]))).toBe(true);
  });
});

describe('no player e na exportação (toFrameInput)', () => {
  const m: MediaItem = { id: 'm', kind: 'video', name: 'a.mp4', file: {} as File, url: '', thumbnail: null, duration: 10, width: 1920, height: 1080, hasAudio: false };
  const frames = [0, 1, 2, 3].map((i) => frame(i / 10, 0.51));

  it('a correção entra antes dos efeitos do clipe; projeto antigo (sem gaze) não muda', () => {
    const clip = { ...createVideoClip(m), trimOut: 4 };
    const blur = { uid: 'x', pluginId: 'effects/desfocar-objeto', enabled: true, params: {} };
    const project = insertVideoClips({ ...createProject(), media: [m] }, [{ ...clip, effects: [blur], gaze: createGaze('m', frames) }]);
    const at = (p: typeof project, t: number) => toFrameInput(resolveFrame(p, layoutProject(p), t), () => ({ source: null }));
    expect(at(project, 0.15).a!.effects.map((e) => e.pluginId)).toEqual([GAZE_PLUGIN_ID, 'effects/desfocar-objeto']);
    // Depois dos quadros analisados: nada.
    expect(at(project, 2).a!.effects.map((e) => e.pluginId)).toEqual(['effects/desfocar-objeto']);
    const old = insertVideoClips({ ...createProject(), media: [m] }, [{ ...clip, effects: [blur] }]);
    expect(at(old, 0.15).a!.effects.map((e) => e.pluginId)).toEqual(['effects/desfocar-objeto']);
  });

  it('camadas de cima: a mídia ocupa a camada toda (sem encaixe)', () => {
    const base = addVideoTrack(insertVideoClips({ ...createProject(), media: [m] }, [{ ...createVideoClip(m), trimOut: 4 }]));
    const overlay = { ...createOverlayClip(m, 0), trimOut: 4, gaze: createGaze('m', frames) };
    const project = { ...base, videoTracks: [{ ...base.videoTracks[0], clips: [overlay] }] };
    const input = toFrameInput(resolveFrame(project, layoutProject(project), 0.15), () => ({ source: null }));
    expect(input.layers?.[0]?.effects[0]?.params.encaixe).toBe(0);
  });
});
