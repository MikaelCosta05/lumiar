import { describe, expect, it } from 'vitest';
import { createCamera } from './camera';
import { createProject, createVideoClip, fadeGain, layoutProject, resolveFrame, type MediaItem, type Project } from './model';
import { makeBoomerang, makeSeamlessLoop, mirrorKeyframes } from './loops';

function media(id: string, duration = 10): MediaItem {
  return { id, kind: 'video', name: `${id}.mp4`, file: {} as File, url: '', thumbnail: null, duration, width: 1920, height: 1080, hasAudio: true };
}

/** Um clipe de 4 s (do segundo 2 ao 6 do arquivo) e outro depois, com transição entre eles. */
function project(): Project {
  const a = media('a');
  const b = media('b');
  const first = { ...createVideoClip(a), id: 'c1', trimIn: 2, trimOut: 6 };
  const second = { ...createVideoClip(b), id: 'c2', trimIn: 0, trimOut: 3 };
  return { ...createProject(), media: [a, b], clips: [first, second], transitions: [null] };
}

describe('loop perfeito', () => {
  it('o começo vira uma camada que aparece aos poucos por cima do fim', () => {
    const result = makeSeamlessLoop(project(), 'c1', 0.5)!;
    expect(result.fade).toBe(0.5);
    const p = result.project;
    const main = p.clips.find((c) => c.id === result.clipId)!;
    // O clipe agora começa meio segundo depois e dura 3,5 s.
    expect([main.trimIn, main.trimOut]).toEqual([2.5, 6]);
    expect(p.clips.map((c) => c.id)).toEqual([result.clipId, 'c2']);
    expect(p.transitions).toEqual([null]);
    const overlay = p.videoTracks.flatMap((t) => t.clips).find((c) => c.id === result.overlayId)!;
    expect([overlay.trimIn, overlay.trimOut, overlay.start, overlay.fadeIn]).toEqual([2, 2.5, 3, 0.5]);
    expect(overlay.transform.scale).toBe(1);
  });

  it('no último instante a camada está quase inteira e mostra o quadro em que o clipe começa', () => {
    const { project: p, clipId } = makeSeamlessLoop(project(), 'c1', 0.5)!;
    const timeline = layoutProject(p);
    const end = timeline.clips.find((l) => l.clip.id === clipId)!;
    const t = end.start + end.length - 0.001;
    const frame = resolveFrame(p, timeline, t);
    const overlay = frame.overlays[0];
    expect(overlay.opacity).toBeGreaterThan(0.99);
    // O quadro da camada é o primeiro quadro do clipe repetido: emenda sem pulo.
    expect(overlay.active.sourceTime).toBeCloseTo(end.clip.trimIn, 2);
    // E no começo do dissolve ela ainda não aparece.
    const startFrame = resolveFrame(p, timeline, end.start + end.length - 0.5 + 0.001);
    expect(fadeGain(startFrame.overlays[0].active.layout.clip as never, startFrame.overlays[0].active.clipTime)).toBeLessThan(0.01);
  });

  it('com "Preencher a tela" a camada cobre a tela como o clipe', () => {
    const base = project();
    base.clips[0] = { ...base.clips[0], camera: { ...createCamera(), fill: true } };
    const p = { ...base, width: 1080, height: 1920 };
    const { project: out, overlayId } = makeSeamlessLoop(p, 'c1')!;
    const overlay = out.videoTracks.flatMap((t) => t.clips).find((c) => c.id === overlayId)!;
    expect(overlay.transform.scale).toBeCloseTo((1920 / 1080) * (1920 / 1080), 3);
    expect(overlay.camera?.fill).toBe(false);
  });

  it('clipe curto: o dissolve fica em um terço; muito curto ou foto: não dá', () => {
    const p = project();
    p.clips[0] = { ...p.clips[0], trimOut: 2.9 };
    expect(makeSeamlessLoop(p, 'c1', 1)!.fade).toBeCloseTo(0.3, 6);
    p.clips[0] = { ...p.clips[0], trimOut: 2.2 };
    expect(makeSeamlessLoop(p, 'c1', 1)).toBeNull();
    const photo = project();
    photo.media[0] = { ...photo.media[0], kind: 'image' };
    expect(makeSeamlessLoop(photo, 'c1')).toBeNull();
  });
});

describe('boomerang', () => {
  it('a cópia invertida entra logo depois, com corte seco, e a transição seguinte passa para depois dela', () => {
    const base = project();
    base.transitions = [{ pluginId: 'transitions/dissolver', duration: 0.5, params: {} }];
    const reversed = media('a-invertido', 4);
    const result = makeBoomerang(base, 'c1', reversed)!;
    const p = result.project;
    expect(p.clips.map((c) => c.id)).toEqual(['c1', result.id, 'c2']);
    expect(p.transitions[0]).toBeNull();
    expect(p.transitions[1]?.pluginId).toBe('transitions/dissolver');
    const back = p.clips[1];
    expect([back.mediaId, back.trimIn, back.trimOut]).toEqual(['a-invertido', 0, 4]);
    expect(p.media.map((m) => m.id)).toContain('a-invertido');
  });

  it('a câmera e o rastreio de rosto tocam ao contrário', () => {
    const base = project();
    base.clips[0] = {
      ...base.clips[0],
      camera: {
        ...createCamera(),
        keyframes: { zoom: [{ time: 0, value: 1, easing: 'ease-in' }, { time: 3, value: 2, easing: 'linear' }] },
        follow: { kind: 'face', points: [{ t: 2, x: 0.3, y: 0.5, size: 0.1 }, { t: 6, x: 0.7, y: 0.5, size: 0.1 }], zoom: 1, smoothness: 0.5, mode: 'center', anchorTime: 2 },
      },
    };
    const p = makeBoomerang(base, 'c1', media('r', 4))!.project;
    const cam = p.clips[1].camera!;
    expect(cam.keyframes.zoom).toEqual([
      { time: 1, value: 2, easing: 'ease-out' },
      { time: 4, value: 1, easing: 'ease-in' },
    ]);
    expect(cam.follow!.points.map((pt) => [pt.t, pt.x])).toEqual([
      [0, 0.7],
      [4, 0.3],
    ]);
  });

  it('keyframes espelhados', () => {
    expect(mirrorKeyframes(undefined, 3)).toBeUndefined();
    expect(mirrorKeyframes({ x: [{ time: 0.5, value: 0, easing: 'linear' }] }, 2)).toEqual({ x: [{ time: 1.5, value: 0, easing: 'linear' }] });
  });
});
