import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PREVIEW_MEDIA, PREVIEW_SOURCES, isPreviewMedia, packMedia, pluginMedia, secondMedia } from './previewMedia';

const effect = (id: string, category: string, previewMedia?: unknown) => ({ id: `effects/${id}`, kind: 'effect' as const, category, previewMedia });

describe('mídia das miniaturas dos plugins', () => {
  it('a pessoa falando é o padrão', () => {
    expect(pluginMedia(effect('glitch', 'Distorção'))).toBe('pessoa');
    expect(pluginMedia({ id: 'filters/cinema', kind: 'filter', category: 'Cinema' })).toBe('pessoa');
    expect(pluginMedia({ id: 'effects/meu', kind: 'effect', category: 'Meus efeitos' })).toBe('pessoa');
  });

  it('cenários ficam com paisagem, cidade ou drone', () => {
    expect(pluginMedia(effect('trocar-ceu', 'Profundidade'))).toBe('paisagem');
    expect(pluginMedia(effect('neblina-fundo', 'Profundidade'))).toBe('paisagem');
    expect(pluginMedia(effect('chuva', 'Clima'))).toBe('paisagem');
    expect(pluginMedia({ id: 'filters/outono', kind: 'filter', category: 'Atmosfera' })).toBe('paisagem');
    expect(pluginMedia({ id: 'filters/noite-neon', kind: 'filter', category: 'Atmosfera' })).toBe('cidade');
  });

  it('embaixo d’água fica na pessoa, apesar da categoria Clima', () => {
    expect(pluginMedia(effect('debaixo-dagua', 'Clima'))).toBe('pessoa');
  });

  it('retrato usa a foto e o tempo usa a pessoa em movimento', () => {
    expect(pluginMedia({ id: 'filters/pele-suave', kind: 'filter', category: 'Retrato' })).toBe('retrato');
    expect(pluginMedia(effect('datamosh', 'Tempo'))).toBe('movimento');
  });

  it('quem olha para o passado ganha a pessoa em movimento (clones, rastro, congelar)', () => {
    expect(pluginMedia(effect('clones', 'Pessoa'), { history: true })).toBe('movimento');
    expect(pluginMedia(effect('congelar-pessoa', 'Pessoa'), { state: true })).toBe('movimento');
    expect(pluginMedia(effect('contorno-neon', 'Pessoa'))).toBe('pessoa');
  });

  it('transições começam na pessoa e o próximo clipe é a pessoa em movimento', () => {
    const media = pluginMedia({ id: 'transitions/datamosh', kind: 'transition', category: 'Distorção' }, { state: true, motion: true });
    expect(media).toBe('pessoa');
    expect(secondMedia(media)).toBe('movimento');
    expect(secondMedia('movimento')).toBe('pessoa');
  });

  it('categorias de terror usam a silhueta, mesmo com nome novo', () => {
    expect(pluginMedia(effect('fita-perdida', 'Terror analógico'))).toBe('silhueta');
    expect(pluginMedia(effect('qualquer', 'Horror'))).toBe('silhueta');
    expect(pluginMedia(effect('vhs', 'Retrô'))).toBe('silhueta');
    expect(pluginMedia(effect('sinal-fraco', 'Analógico'))).toBe('silhueta');
  });

  it('"previewMedia" do plugin.json manda; valor desconhecido é ignorado', () => {
    expect(pluginMedia(effect('trocar-ceu', 'Profundidade', 'pessoa'))).toBe('pessoa');
    expect(pluginMedia(effect('glitch', 'Distorção', 'drone'))).toBe('drone');
    expect(pluginMedia(effect('glitch', 'Distorção', 'praia'))).toBe('pessoa');
  });
});

describe('mídia das miniaturas dos pacotes', () => {
  it('pela categoria', () => {
    expect(packMedia({ id: 'packs/neblina', category: 'Clima e estações' })).toBe('paisagem');
    expect(packMedia({ id: 'packs/terror', category: 'Suspense e terror' })).toBe('silhueta');
    expect(packMedia({ id: 'packs/novo', category: 'Terror analógico' })).toBe('silhueta');
    expect(packMedia({ id: 'packs/bonk', category: 'Comédia e memes' })).toBe('pessoa');
    expect(packMedia({ id: 'custom/abc', category: 'Meus pacotes' })).toBe('pessoa');
  });

  it('câmera em movimento: drone só nos voos e revelações de cenário', () => {
    expect(packMedia({ id: 'packs/drone-subindo', category: 'Câmera em movimento' })).toBe('drone');
    expect(packMedia({ id: 'packs/crash-zoom', category: 'Câmera em movimento' })).toBe('pessoa');
  });
});

describe('mídias e plugin.json', () => {
  it('todas as mídias existem em public/previews e têm crédito', () => {
    const credits = readFileSync('public/previews/CREDITOS.md', 'utf8');
    for (const media of PREVIEW_MEDIA) {
      const file = PREVIEW_SOURCES[media].file;
      expect(existsSync(join('public', file)), file).toBe(true);
      expect(credits, file).toContain(file.replace('previews/', ''));
    }
  });

  it('"previewMedia" nos plugin.json, quando existe, é um nome válido', () => {
    for (const kind of ['effects', 'filters', 'transitions']) {
      for (const name of readdirSync(join('plugins', kind))) {
        const path = join('plugins', kind, name, 'plugin.json');
        if (!existsSync(path)) continue;
        const manifest = JSON.parse(readFileSync(path, 'utf8')) as { previewMedia?: unknown };
        if (manifest.previewMedia !== undefined) expect(isPreviewMedia(manifest.previewMedia), path).toBe(true);
      }
    }
  });
});
