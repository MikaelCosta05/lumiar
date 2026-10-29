import { describe, expect, it } from 'vitest';
import { buildPluginSource, pluginInputs } from './shaders';
import { getPlugin } from './registry';
import { createProject, projectNeeds } from '../project/model';
import type { ShaderPlugin } from './types';

/** Transições também podem usar a profundidade de cada clipe (getFromDepth / getToDepth). */
describe('profundidade nas transições', () => {
  const transition = (glsl: string): ShaderPlugin => ({
    id: 'transitions/teste',
    kind: 'transition',
    name: 'Teste',
    description: '',
    category: 'Geral',
    params: [],
    previewParams: {},
    glsl,
  });

  it('percebe quando a transição chama getFromDepth ou getToDepth', () => {
    expect(pluginInputs(transition('vec4 transition(vec2 uv) { return vec4(getFromDepth(uv)); }')).depth).toBe(true);
    expect(pluginInputs(transition('vec4 transition(vec2 uv) { return vec4(getToDepth (uv)); }')).depth).toBe(true);
    expect(pluginInputs(transition('vec4 transition(vec2 uv) { return getToColor(uv); }')).depth).toBe(false);
    // Comentário não conta.
    expect(pluginInputs(transition('// getFromDepth(uv)\nvec4 transition(vec2 uv) { return getToColor(uv); }')).depth).toBe(false);
  });

  it('o prelúdio da transição tem as funções e os uniforms', () => {
    const { source } = buildPluginSource(transition('vec4 transition(vec2 uv) { return vec4(getFromDepth(uv)); }'));
    expect(source).toContain('float getFromDepth(vec2 uv)');
    expect(source).toContain('float getToDepth(vec2 uv)');
    expect(source).toContain('uniform vec2 uHasDepth;');
  });

  it('um projeto com a transição "Por profundidade" pede a profundidade', () => {
    expect(getPlugin('transitions/por-profundidade')).toBeTruthy();
    const project = createProject();
    expect(projectNeeds(project).depth).toBe(false);
    const withDepth = { ...project, transitions: [{ pluginId: 'transitions/por-profundidade', duration: 1, params: {} }] };
    expect(projectNeeds(withDepth).depth).toBe(true);
  });
});
