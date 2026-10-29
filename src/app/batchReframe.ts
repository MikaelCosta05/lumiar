import { trackFace } from '../media/tracking';
import type { TrackPoint } from '../project/camera';
import { layoutProject, type Project } from '../project/model';
import { reframeForFormat } from '../project/reframe';

/** Rostos já procurados (mídia + trecho): os outros formatos da mesma exportação reaproveitam. */
const cache = new Map<string, Promise<TrackPoint[]>>();

/** Procura os rostos dos vídeos da trilha principal (os que ainda não seguem nada). */
export async function findFaces(project: Project, onProgress: (fraction: number) => void, signal?: AbortSignal): Promise<Map<string, TrackPoint[]>> {
  const layouts = layoutProject(project).clips.filter((l) => l.media.kind === 'video' && !l.clip.camera?.follow);
  const faces = new Map<string, TrackPoint[]>();
  for (const [n, l] of layouts.entries()) {
    if (signal?.aborted) break;
    const key = `${l.media.id}:${l.clip.trimIn}:${l.clip.trimOut}`;
    let found = cache.get(key);
    if (!found) {
      found = trackFace(l.media, l.clip.trimIn, l.clip.trimOut, (f) => onProgress((n + f) / layouts.length));
      cache.set(key, found);
      // Se falhar, a próxima exportação tenta de novo.
      found.catch(() => cache.delete(key));
    }
    const points = await found.catch(() => [] as TrackPoint[]);
    if (points.length) faces.set(l.clip.id, points);
    onProgress((n + 1) / layouts.length);
  }
  return faces;
}

/** O projeto reenquadrado para o formato, seguindo os rostos. */
export async function reframedProject(project: Project, width: number, height: number, onProgress: (fraction: number) => void, signal?: AbortSignal): Promise<Project> {
  return reframeForFormat(project, width, height, await findFaces(project, onProgress, signal));
}
