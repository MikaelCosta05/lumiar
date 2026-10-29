import { createCamera, type CameraFollow, type TrackPoint } from './camera';
import type { Project } from './model';

/**
 * Reenquadrar o projeto para outro formato (9:16, 1:1, 4:5…) na exportação em vários formatos:
 * igual ao "Converter para vertical", cada clipe da trilha principal preenche a tela e a câmera segue
 * o rosto de quem aparece (os rostos são procurados uma vez só e servem para todos os formatos).
 */

/** Mesmo seguimento do "Converter para vertical" (recipes.ts). */
export function faceFollow(points: TrackPoint[], anchorTime: number): CameraFollow {
  return { kind: 'face', points, zoom: 1, smoothness: 0.8, mode: 'center', anchorTime };
}

/** A proporção muda de verdade? (1% de diferença é arredondamento) */
export function sameShape(a: { width: number; height: number }, b: { width: number; height: number }): boolean {
  return Math.abs(a.width / a.height - b.width / b.height) < 0.01;
}

/**
 * O projeto no tamanho do formato, com cada clipe preenchendo a tela. Clipes com rosto (`faces`, pelo id
 * do clipe) passam a segui-lo; um seguimento que o clipe já tinha (rosto ou ponto escolhido) continua valendo.
 */
export function reframeForFormat(project: Project, width: number, height: number, faces: Map<string, TrackPoint[]>): Project {
  if (sameShape(project, { width, height })) return { ...project, width, height };
  return {
    ...project,
    width,
    height,
    clips: project.clips.map((c) => {
      const camera = c.camera ?? createCamera();
      const points = faces.get(c.id);
      const follow = camera.follow ?? (points?.length ? faceFollow(points, c.trimIn) : null);
      return { ...c, camera: { ...camera, fill: true, follow } };
    }),
  };
}

/** Nome do arquivo com o formato no fim: "Meu vídeo - 9x16.mp4". */
export function formatFileName(base: string, suffix: string, extension: string): string {
  const clean = suffix.trim().replace(/[\\/:*?"<>|\s]+/g, '-');
  return `${base}${clean ? ` - ${clean}` : ''}.${extension}`;
}

/** "9x16", "1x1", "4x5"… a partir do tamanho. */
export function aspectSuffix(width: number, height: number): string {
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const g = gcd(width, height);
  const w = width / g;
  const h = height / g;
  return w <= 32 && h <= 32 ? `${w}x${h}` : `${width}x${height}`;
}
