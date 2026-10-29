import { describe, expect, it } from 'vitest';
import { createCamera } from './camera';
import { createProject, createVideoClip, type MediaItem, type Project } from './model';
import { aspectSuffix, formatFileName, reframeForFormat, sameShape } from './reframe';

function media(id: string): MediaItem {
  return { id, kind: 'video', name: `${id}.mp4`, file: {} as File, url: '', thumbnail: null, duration: 10, width: 1920, height: 1080, hasAudio: false };
}

function project(): Project {
  const a = media('a');
  const b = media('b');
  const point = { ...createCamera(), follow: { kind: 'point' as const, points: [{ t: 0, x: 0.2, y: 0.2, size: 0 }], zoom: 1.5, smoothness: 0.3, mode: 'center' as const, anchorTime: 0 } };
  return {
    ...createProject(),
    width: 1920,
    height: 1080,
    media: [a, b],
    clips: [
      { ...createVideoClip(a), id: 'c1', trimIn: 1, trimOut: 4 },
      { ...createVideoClip(b), id: 'c2', camera: point },
    ],
    transitions: [null],
  };
}

describe('reenquadrar para cada formato', () => {
  it('mesma proporção: só o tamanho muda', () => {
    const p = project();
    const out = reframeForFormat(p, 1280, 720, new Map());
    expect([out.width, out.height]).toEqual([1280, 720]);
    expect(out.clips).toBe(p.clips);
  });

  it('outra proporção: preenche a tela e segue o rosto achado; o seguimento que já existia continua', () => {
    const faces = new Map([['c1', [{ t: 1, x: 0.7, y: 0.4, size: 0.1 }]]]);
    const out = reframeForFormat(project(), 1080, 1920, faces);
    expect([out.width, out.height]).toEqual([1080, 1920]);
    const [c1, c2] = out.clips;
    expect(c1.camera?.fill).toBe(true);
    expect(c1.camera?.follow).toMatchObject({ kind: 'face', mode: 'center', anchorTime: 1, smoothness: 0.8 });
    expect(c1.camera?.follow?.points).toHaveLength(1);
    expect(c2.camera?.fill).toBe(true);
    expect(c2.camera?.follow?.kind).toBe('point');
  });

  it('sem rosto: preenche a tela centralizado', () => {
    const out = reframeForFormat(project(), 1080, 1080, new Map());
    expect(out.clips[0].camera).toMatchObject({ fill: true, follow: null });
  });

  it('nome do arquivo com o formato no fim', () => {
    expect(formatFileName('Meu vídeo', '9x16', 'mp4')).toBe('Meu vídeo - 9x16.mp4');
    expect(formatFileName('Meu vídeo', '', 'gif')).toBe('Meu vídeo.gif');
    expect(aspectSuffix(1920, 1080)).toBe('16x9');
    expect(aspectSuffix(1080, 1350)).toBe('4x5');
    expect(aspectSuffix(1080, 1080)).toBe('1x1');
    expect(sameShape({ width: 1920, height: 1080 }, { width: 1280, height: 720 })).toBe(true);
    expect(sameShape({ width: 1920, height: 1080 }, { width: 1080, height: 1920 })).toBe(false);
  });
});
