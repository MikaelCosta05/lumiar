import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateCamera, type CameraTransform } from './camera';
import { PACK_CATEGORIES, PACKS } from './packLibrary';
import { applyBeatPattern, createPackClip, type PackClip, type PackTemplate } from './packs';

/**
 * Confere os pacotes prontos: cada filtro e efeito aponta para uma pasta de plugin que existe
 * e só mexe em parâmetros que o plugin tem (um nome errado não dá erro: o pacote só não faria nada).
 */

const PLUGINS = join(__dirname, '..', '..', 'plugins');

function paramsOf(pluginId: string): Set<string> | null {
  const folder = join(PLUGINS, ...pluginId.split('/'));
  if (!existsSync(join(folder, 'plugin.json')) || !existsSync(join(folder, 'shader.glsl'))) return null;
  const manifest = JSON.parse(readFileSync(join(folder, 'plugin.json'), 'utf8')) as { params?: { id: string }[] };
  return new Set((manifest.params ?? []).map((p) => p.id));
}

describe('pacotes prontos', () => {
  it('ids únicos', () => {
    const ids = PACKS.map((p) => p.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  it('todo pacote está numa categoria da biblioteca', () => {
    expect(PACKS.filter((p) => !PACK_CATEGORIES.includes(p.category)).map((p) => p.id)).toEqual([]);
  });

  it('cada filtro e efeito existe em plugins/', () => {
    const missing = PACKS.flatMap((p) =>
      [...p.effects.map((e) => e.pluginId), ...(p.filter ? [p.filter.pluginId] : [])]
        .filter((id) => paramsOf(id) === null)
        .map((id) => `${p.id} → ${id}`),
    );
    expect(missing).toEqual([]);
  });

  it('os parâmetros (fixos, animados e nas batidas) existem no plugin', () => {
    const wrong: string[] = [];
    for (const p of PACKS) {
      const check = (pluginId: string, keys: string[], extra: string[] = []) => {
        const known = paramsOf(pluginId);
        if (!known) return;
        for (const k of keys) if (!known.has(k) && !extra.includes(k)) wrong.push(`${p.id} → ${pluginId}.${k}`);
      };
      p.effects.forEach((e) => check(e.pluginId, [...Object.keys(e.params ?? {}), ...Object.keys(e.keyframes ?? {})]));
      if (p.filter) check(p.filter.pluginId, [...Object.keys(p.filter.params ?? {}), ...Object.keys(p.filter.keyframes ?? {})], ['intensity']);
      for (const key of Object.keys(p.beat?.pulses ?? {})) {
        const [kind, a, b] = key.split('.');
        if (kind === 'effects') {
          const effect = p.effects[Number(a)];
          if (!effect) wrong.push(`${p.id} → batida em efeito que não existe: ${key}`);
          else check(effect.pluginId, [b]);
        } else if (kind === 'filter') {
          if (!p.filter) wrong.push(`${p.id} → batida no filtro sem filtro: ${key}`);
          else check(p.filter.pluginId, [a], ['intensity']);
        } else if (kind !== 'camera') wrong.push(`${p.id} → batida desconhecida: ${key}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('os keyframes de cada pacote ficam dentro da duração e em ordem', () => {
    const wrong: string[] = [];
    for (const p of PACKS) {
      const maps = [...p.effects.map((e) => e.keyframes), p.filter?.keyframes, p.camera?.keyframes];
      for (const map of maps) {
        for (const [id, kfs] of Object.entries(map ?? {})) {
          if (kfs.some((k, i) => k.time < 0 || k.time > p.duration + 1e-6 || (i > 0 && k.time < kfs[i - 1].time))) wrong.push(`${p.id} → ${id}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });
});

// ---------------------------------------------------------------- Câmera dos pacotes

/** Vista da câmera do pacote, com as mesmas contas do shader de origem (imagem esticada, centro limitado). */
function view(c: CameraTransform, ratio: number) {
  const zoom = Math.max(0.05, c.zoom);
  const r = (c.rotation * Math.PI) / 180;
  const h = 0.5 / zoom;
  const clamp = (v: number) => Math.min(Math.max(v, Math.min(h, 0.5)), Math.max(1 - h, 0.5));
  const center = [clamp(c.x), clamp(1 - c.y)];
  /** Ponto da imagem (0 a 1, y para cima) que aparece no ponto (u, v) da tela. */
  return (u: number, v: number) => {
    const sx = (u - 0.5) * ratio;
    const sy = v - 0.5;
    return [(Math.cos(r) * sx - Math.sin(r) * sy) / zoom / ratio + center[0], (Math.sin(r) * sx + Math.cos(r) * sy) / zoom + center[1]];
  };
}

/** Folga (em px de um quadro 1080p) entre os cantos da tela e a borda da imagem: negativo = canto preto. */
function coverMargin(c: CameraTransform, ratio: number): number {
  const at = view(c, ratio);
  let margin = Infinity;
  for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const [x, y] = at(u, v);
    margin = Math.min(margin, x * ratio, (1 - x) * ratio, y, 1 - y);
  }
  return margin * 1080;
}

/** Quanto a vista do pacote se afasta da imagem original (px 1080p): na mistura das entradas, vira imagem dobrada. */
function ghostShift(c: CameraTransform, ratio = 16 / 9): number {
  const at = view(c, ratio);
  let shift = 0;
  for (const u of [0.1, 0.5, 0.9]) {
    for (const v of [0.1, 0.5, 0.9]) {
      const [x, y] = at(u, v);
      shift = Math.max(shift, Math.hypot((x - u) * ratio, y - v) * 1080);
    }
  }
  return shift;
}

/** Duração do bloco depois de mudar a velocidade (câmera lenta deixa o trecho mais longo). */
const blockLength = (p: PackTemplate) => (p.speed?.length ? p.speed.reduce((sum, s) => sum + p.duration / p.speed!.length / s, 0) : p.duration);

/** Os blocos que um pacote pode virar: duração sugerida, mais curto e mais longo; nas batidas, dois andamentos. */
function blocksOf(p: PackTemplate): PackClip[] {
  if (p.beat) {
    return [0.5, 0.37].map((step) => {
      const clip = createPackClip(p, 0, 8);
      return applyBeatPattern(clip, p.beat!, Array.from({ length: Math.floor(8 / step) }, (_, i) => i * step));
    });
  }
  const d = blockLength(p);
  return (p.timing === 'fixed' ? [d] : [d, d * 0.5, d * 2.5]).map((length) => createPackClip(p, 0, length));
}

describe('câmera dos pacotes', () => {
  const moving = PACKS.filter((p) => p.camera || p.beat);

  it('nunca mostra canto preto: o zoom cobre o giro e o deslocamento em todos os instantes (16:9 e 9:16)', () => {
    const wrong: string[] = [];
    for (const p of moving) {
      for (const clip of blocksOf(p)) {
        if (!clip.camera) continue;
        let worst = Infinity;
        for (let t = 0; t <= clip.duration; t += 1 / 240) {
          const c = evaluateCamera(clip.camera, t, t);
          worst = Math.min(worst, coverMargin(c, 16 / 9), coverMargin(c, 9 / 16));
        }
        if (worst < -0.05) wrong.push(`${p.id} (${clip.duration.toFixed(1)} s): ${worst.toFixed(1)} px`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('a entrada e a saída suaves não misturam duas vistas diferentes (imagem dobrada)', () => {
    const wrong: string[] = [];
    for (const p of moving) {
      const clip = blocksOf(p)[0];
      if (!clip.camera) continue;
      let worst = 0;
      for (let t = 0; t < clip.duration; t += 1 / 120) {
        let fade = 1;
        if (clip.fadeIn > 0) fade = Math.min(fade, t / clip.fadeIn);
        if (clip.fadeOut > 0) fade = Math.min(fade, (clip.duration - t) / clip.fadeOut);
        const amount = clip.intensity * Math.min(1, Math.max(0, fade));
        if (amount > 0.05 && amount < 0.95) worst = Math.max(worst, ghostShift(evaluateCamera(clip.camera, t, t)));
      }
      if (worst > 12) wrong.push(`${p.id}: ${worst.toFixed(0)} px`);
    }
    expect(wrong).toEqual([]);
  });
});
