import { describe, expect, it } from 'vitest';
import { createCamera } from './camera';
import { createOverlayClip, createProject, createVideoClip, insertVideoClips, layoutProject, resolveFrame, toFrameInput, type MediaItem, type Project } from './model';
import {
  addMotionBlur,
  blurSamples,
  cameraShift,
  clipBlurAmount,
  DEFAULT_MOTION_BLUR,
  exposureTimes,
  motionBlurOf,
  packBlurAmount,
  placeShift,
  textMoving,
} from './motionBlur';
import { createPackTrack, type PackClip } from './packs';

function media(id: string): MediaItem {
  return { id, kind: 'video', name: `${id}.mp4`, file: {} as File, url: '', thumbnail: null, duration: 10, width: 1920, height: 1080, hasAudio: false };
}

const screen = { width: 1920, height: 1080 };
const still = { zoom: 1.2, x: 0.5, y: 0.5, rotation: 0, fill: false };

/** Projeto com um clipe de 4 s cuja câmera vai de x = 0,3 a x = 0,7 (panorâmica rápida). */
function panning(extra: Partial<Project> = {}): Project {
  const m = media('a');
  const clip = createVideoClip(m);
  clip.trimOut = 4;
  clip.camera = {
    ...createCamera(),
    base: { zoom: 2, x: 0.5, y: 0.5, rotation: 0 },
    keyframes: { x: [{ time: 0, value: 0.3, easing: 'linear' }, { time: 4, value: 0.7, easing: 'linear' }] },
  };
  return { ...insertVideoClips({ ...createProject(), media: [m] }, [clip]), ...extra };
}

function frameAt(project: Project, t: number) {
  const timeline = layoutProject(project);
  const frame = toFrameInput(resolveFrame(project, timeline, t), () => ({ source: null }));
  return { frame, timeline };
}

describe('desfoque de movimento: ajustes', () => {
  it('projetos sem a opção (antigos): só os pacotes de câmera, moderado', () => {
    expect(motionBlurOf({})).toEqual(DEFAULT_MOTION_BLUR);
    expect(DEFAULT_MOTION_BLUR).toEqual({ mode: 'packs', amount: 0.5 });
    const camera = createCamera();
    expect(clipBlurAmount(DEFAULT_MOTION_BLUR, { camera })).toBe(0);
    expect(packBlurAmount(DEFAULT_MOTION_BLUR, { camera })).toBe(0.5);
    expect(packBlurAmount(DEFAULT_MOTION_BLUR, { camera: null })).toBe(0);
  });

  it('o ajuste da câmera vale mais que o do projeto (0 = desligado)', () => {
    const all = { mode: 'all' as const, amount: 0.8 };
    expect(clipBlurAmount(all, { camera: createCamera() })).toBe(0.8);
    expect(clipBlurAmount(all, { camera: { ...createCamera(), motionBlur: 0 } })).toBe(0);
    expect(clipBlurAmount({ mode: 'off', amount: 0.5 }, { camera: { ...createCamera(), motionBlur: 0.3 } })).toBe(0.3);
    expect(packBlurAmount({ mode: 'off', amount: 0.5 }, { camera: createCamera() })).toBe(0);
    // Valores estranhos no arquivo ficam dentro do limite.
    expect(motionBlurOf({ motionBlur: { mode: 'all', amount: 9 } }).amount).toBe(1.5);
  });
});

describe('desfoque de movimento: medida do movimento', () => {
  it('câmera parada não anda nada; panorâmica anda proporcional ao deslocamento', () => {
    expect(cameraShift(still, still, screen, screen)).toBeCloseTo(0, 6);
    const small = cameraShift({ ...still, x: 0.5 }, { ...still, x: 0.51 }, screen, screen);
    const big = cameraShift({ ...still, x: 0.5 }, { ...still, x: 0.53 }, screen, screen);
    // Com zoom 1,2 a imagem anda 0,01 × 1920 × 1,2 ≈ 23 px.
    expect(small).toBeCloseTo(0.01 * 1920 * 1.2, 0);
    expect(big / small).toBeCloseTo(3, 1);
  });

  it('zoom e giro também contam (mais nos cantos que no centro)', () => {
    expect(cameraShift(still, { ...still, zoom: 1.3 }, screen, screen)).toBeGreaterThan(20);
    expect(cameraShift(still, { ...still, rotation: 2 }, screen, screen)).toBeGreaterThan(20);
  });

  it('camada sobreposta: deslocamento dos cantos', () => {
    const a = { x: 0.5, y: 0.5, scale: 0.4, rotation: 0 };
    expect(placeShift(a, { ...a, x: 0.6 }, { width: 1, height: 1 }, screen)).toBeCloseTo(192, 3);
    expect(placeShift(a, a, { width: 1, height: 1 }, screen)).toBe(0);
  });

  it('amostras: nenhuma extra sem movimento; mais no arquivo final que no preview, com limite', () => {
    expect(blurSamples(0, 'export')).toBe(1);
    expect(blurSamples(0.5, 'export')).toBe(1);
    expect(blurSamples(30, 'preview')).toBeLessThan(blurSamples(30, 'export'));
    expect(blurSamples(10000, 'preview')).toBe(12);
    expect(blurSamples(10000, 'export')).toBe(32);
    expect(blurSamples(3, 'export')).toBeGreaterThanOrEqual(2);
  });

  it('instantes da exposição centrados no quadro', () => {
    expect(exposureTimes(1, 0.02, 3)).toEqual([0.99, 1, 1.01]);
    expect(exposureTimes(1, 0.02, 1)).toEqual([1]);
  });
});

describe('desfoque de movimento: no quadro', () => {
  it('desligado: nada muda', () => {
    const project = panning({ motionBlur: { mode: 'off', amount: 0.5 } });
    const { frame, timeline } = frameAt(project, 2);
    addMotionBlur(frame, project, timeline, 2, 30, 'export', screen);
    expect(frame.a?.motionBlur ?? null).toBeNull();
  });

  it('com "Tudo": a câmera do clipe ganha o começo e o fim da exposição, em volta da câmera do quadro', () => {
    const project = panning({ motionBlur: { mode: 'all', amount: 0.5 } });
    const { frame, timeline } = frameAt(project, 2);
    addMotionBlur(frame, project, timeline, 2, 30, 'export', screen);
    const blur = frame.a?.motionBlur;
    expect(blur).toBeTruthy();
    // 0,1 de x por segundo; exposição de 0,5/30 s → ±0,000833 em volta de 0,5.
    expect(blur!.from.x).toBeCloseTo(0.5 - 0.1 * (0.5 / 30 / 2), 6);
    expect(blur!.to.x).toBeCloseTo(0.5 + 0.1 * (0.5 / 30 / 2), 6);
    expect(blur!.samples).toBeGreaterThan(1);
    // Mais intensidade, rastro maior e mais amostras.
    const strong = panning({ motionBlur: { mode: 'all', amount: 1.5 } });
    const f2 = frameAt(strong, 2);
    addMotionBlur(f2.frame, strong, f2.timeline, 2, 30, 'export', screen);
    expect(f2.frame.a!.motionBlur!.to.x - f2.frame.a!.motionBlur!.from.x).toBeCloseTo(3 * (blur!.to.x - blur!.from.x), 6);
    expect(f2.frame.a!.motionBlur!.samples).toBeGreaterThan(blur!.samples);
  });

  it('o padrão (só pacotes) não borra a câmera do clipe, mas borra o pacote com câmera', () => {
    const base = panning();
    const pack: PackClip = {
      id: 'p',
      packId: 'x',
      name: 'Zoom',
      color: '#fff',
      start: 0,
      duration: 4,
      intensity: 1,
      fadeIn: 0,
      fadeOut: 0,
      effects: [],
      filter: null,
      camera: { ...createCamera(), keyframes: { zoom: [{ time: 0, value: 1, easing: 'linear' }, { time: 1, value: 2, easing: 'linear' }] } },
      timing: 'stretch',
    };
    const project: Project = { ...base, packTracks: [{ ...createPackTrack(1), clips: [pack] }] };
    const { frame, timeline } = frameAt(project, 0.5);
    addMotionBlur(frame, project, timeline, 0.5, 30, 'preview', screen);
    expect(frame.a?.motionBlur ?? null).toBeNull();
    const adjust = frame.adjust?.find((a) => a.key === 'pacote:p');
    expect(adjust?.motionBlur?.samples).toBeGreaterThan(1);
    expect(adjust!.motionBlur!.to.zoom).toBeGreaterThan(adjust!.motionBlur!.from.zoom);
    expect(adjust!.motionBlur!.from.fill).toBe(false);
  });

  it('clipe sem câmera e camada parada: sem desfoque', () => {
    const m = media('b');
    const project: Project = {
      ...insertVideoClips({ ...createProject(), media: [m], motionBlur: { mode: 'all', amount: 1 } }, [createVideoClip(m)]),
      videoTracks: [{ id: 'v', name: 'V1', hidden: false, muted: false, clips: [createOverlayClip(m, 0)] }],
    };
    const { frame, timeline } = frameAt(project, 1);
    addMotionBlur(frame, project, timeline, 1, 30, 'export', screen);
    expect(frame.a?.motionBlur ?? null).toBeNull();
    expect(frame.layers?.[0].placeBlur ?? null).toBeNull();
  });
});

describe('desfoque de movimento: textos', () => {
  const text = { duration: 4, animIn: 'slide-up' as const, animOut: 'fade' as const, animDuration: 0.5, loop: 'none' as const };
  it('só enquanto a animação mexe o texto de lugar', () => {
    expect(textMoving(text, 0.2)).toBe(true);
    expect(textMoving(text, 2)).toBe(false);
    // Sumir aos poucos não move o texto.
    expect(textMoving(text, 3.8)).toBe(false);
    expect(textMoving({ ...text, animOut: 'zoom' }, 3.8)).toBe(true);
    expect(textMoving({ ...text, loop: 'float' }, 2)).toBe(true);
    expect(textMoving({ ...text, loop: 'rainbow' }, 2)).toBe(false);
    expect(textMoving(text, 5)).toBe(false);
  });
});
