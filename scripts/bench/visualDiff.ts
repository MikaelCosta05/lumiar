// Teste visual dos plugins (scripts/bench/visual.cjs): compara os quadros de agora com os de referência.
// Aqui só a lógica (métrica, limiar, ordem, relatório), sem Electron, para dar para testar no Vitest.
// O visual.cjs importa este arquivo direto (o Node do Electron entende TypeScript sem tipos especiais).

export interface Limits {
  /** Diferença (0 a 255, no canal que mais mudou) a partir da qual um pixel conta como mudado */
  pixel: number;
  /** Fração dos pixels mudados a partir da qual o quadro mudou */
  changed: number;
  /** Diferença média (0 a 255) a partir da qual o quadro mudou: pega o que mudou pouco na imagem toda */
  mean: number;
}

// Na mesma máquina duas rodadas quase sempre dão diferença zero; a folga é para o que não se vê (dither,
// arredondamento da placa depois de atualizar o driver) e para o chiado dos pacotes de TV e VHS, que muda ~0,07% dos
// pixels de uma rodada para outra. 0,15% são ~195 pixels em 480x270: um desfoque de 6 para 9 px muda 1,3%.
export const LIMITS: Limits = { pixel: 6, changed: 0.0015, mean: 0.5 };

/** Pixels decodificados, 4 bytes por pixel (a ordem dos 3 primeiros não importa; o 4º é o alfa, ignorado) */
export interface Bitmap {
  data: Uint8Array;
  width: number;
  height: number;
}

export interface PixelDiff {
  /** Fração dos pixels (0 a 1) com diferença acima de `pixel` */
  changed: number;
  /** Diferença média dos canais (0 a 255) */
  mean: number;
  /** Maior diferença de um canal (0 a 255) */
  max: number;
}

/**
 * Diferença entre duas imagens do mesmo tamanho. Com `map`, escreve nele o mapa da diferença: a referência
 * escurecida, em cinza, e em magenta (vermelho = azul, então serve para RGBA e BGRA) o que passou de `pixel`.
 */
export function diffPixels(a: Uint8Array, b: Uint8Array, pixel: number, map?: Uint8Array): PixelDiff {
  if (a.length !== b.length) throw new Error('imagens de tamanhos diferentes');
  const count = a.length / 4;
  let sum = 0;
  let max = 0;
  let changed = 0;
  for (let i = 0; i < a.length; i += 4) {
    const d0 = Math.abs(a[i] - b[i]);
    const d1 = Math.abs(a[i + 1] - b[i + 1]);
    const d2 = Math.abs(a[i + 2] - b[i + 2]);
    const d = Math.max(d0, d1, d2);
    sum += d0 + d1 + d2;
    if (d > max) max = d;
    if (d > pixel) changed++;
    if (map) {
      const gray = ((a[i] + a[i + 1] + a[i + 2]) / 3) * 0.3;
      const hot = d > pixel ? Math.min(255, 96 + d * 2) : gray;
      map[i] = hot;
      map[i + 1] = d > pixel ? gray * 0.5 : gray;
      map[i + 2] = hot;
      map[i + 3] = 255;
    }
  }
  return { changed: count ? changed / count : 0, mean: count ? sum / (count * 3) : 0, max };
}

export type ShotStatus = 'igual' | 'mudou' | 'novo' | 'faltou';

export interface ShotResult {
  id: string;
  label: string;
  status: ShotStatus;
  /** null quando falta uma das imagens */
  diff: PixelDiff | null;
}

const ALL: PixelDiff = { changed: 1, mean: 255, max: 255 };

export function isChanged(diff: PixelDiff, limits: Limits = LIMITS): boolean {
  return diff.changed > limits.changed || diff.mean > limits.mean;
}

/** Compara um quadro: sem referência é novo, sem o atual faltou, tamanho diferente mudou tudo. */
export function compareShot(ref: Bitmap | null, cur: Bitmap | null, limits: Limits = LIMITS, map?: Uint8Array): Omit<ShotResult, 'id' | 'label'> {
  if (!ref) return { status: 'novo', diff: null };
  if (!cur) return { status: 'faltou', diff: null };
  if (ref.width !== cur.width || ref.height !== cur.height) return { status: 'mudou', diff: ALL };
  const diff = diffPixels(ref.data, cur.data, limits.pixel, map);
  return { status: isChanged(diff, limits) ? 'mudou' : 'igual', diff };
}

export type PluginStatus = 'erro' | 'sumiu' | 'mudou' | 'novo' | 'igual';

export interface PluginResult {
  id: string;
  status: PluginStatus;
  shots: ShotResult[];
  /** O quadro que mais mudou (null sem nenhuma comparação) */
  worst: PixelDiff | null;
  error?: string;
}

const ORDER: PluginStatus[] = ['erro', 'sumiu', 'mudou', 'novo', 'igual'];

function worse(x: PixelDiff, y: PixelDiff): number {
  return y.changed - x.changed || y.mean - x.mean || y.max - x.max;
}

/**
 * Junta os quadros por plugin e ordena do mais diferente para o menos: erros, plugins que sumiram, os que
 * mudaram (pela fração de pixels, depois pela média), os novos e os iguais.
 */
export function summarize(shots: ShotResult[], errors: { id: string; message: string }[] = [], missing: string[] = []): PluginResult[] {
  const byId = new Map<string, ShotResult[]>();
  for (const id of missing) byId.set(id, []);
  for (const shot of shots) {
    const list = byId.get(shot.id) ?? [];
    list.push(shot);
    byId.set(shot.id, list);
  }
  for (const e of errors) if (!byId.has(e.id)) byId.set(e.id, []);
  const results: PluginResult[] = [];
  for (const [id, list] of byId) {
    const error = errors.find((e) => e.id === id)?.message;
    const diffs = list.map((s) => (s.status === 'faltou' ? ALL : s.diff)).filter((d): d is PixelDiff => !!d);
    const worst = diffs.length ? [...diffs].sort(worse)[0] : null;
    let status: PluginStatus;
    if (error) status = 'erro';
    else if (missing.includes(id)) status = 'sumiu';
    else if (list.length && list.every((s) => s.status === 'novo')) status = 'novo';
    else if (list.some((s) => s.status !== 'igual')) status = 'mudou';
    else status = 'igual';
    results.push({ id, status, shots: list, worst, error });
  }
  return results.sort(
    (x, y) =>
      ORDER.indexOf(x.status) - ORDER.indexOf(y.status) ||
      (x.worst && y.worst ? worse(x.worst, y.worst) : 0) ||
      x.id.localeCompare(y.id),
  );
}

/** Algo mudou de verdade (é o que faz o comando sair com erro). */
export function failed(results: PluginResult[]): boolean {
  return results.some((r) => r.status === 'erro' || r.status === 'sumiu' || r.status === 'mudou');
}

/** Nome do arquivo de um quadro ("t=0.5" → "t=0.5.png"). */
export function shotFile(label: string): string {
  return `${label.replace(/[^a-z0-9.=]/gi, '_')}.png`;
}

const percent = (f: number) => `${(f * 100).toFixed(2)}%`;

/** Uma linha do terminal. */
export function describe(result: PluginResult): string {
  if (result.status === 'erro') return `ERRO   ${result.id}: ${(result.error ?? '').slice(0, 300)}`;
  if (result.status === 'sumiu') return `SUMIU  ${result.id} (tem referência, mas não foi desenhado)`;
  if (result.status === 'novo') return `NOVO   ${result.id} (sem referência)`;
  const w = result.worst;
  const head = result.status === 'mudou' ? 'MUDOU ' : 'igual ';
  if (!w) return `${head} ${result.id}`;
  const shots = result.shots.filter((s) => s.status !== 'igual').map((s) => s.label);
  return `${head} ${percent(w.changed).padStart(7)} dos pixels  média ${w.mean.toFixed(2).padStart(6)}  máx ${String(w.max).padStart(3)}  ${result.id}${shots.length ? `  (${shots.join(', ')})` : ''}`;
}

const escape = (text: string) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const src = (dir: string, id: string, label: string) => escape(encodeURI(`${dir}/${id}/${shotFile(label)}`));

export interface ReportInfo {
  /** Quando a referência foi gerada e quando foi esta comparação (texto livre) */
  reference: string;
  now: string;
  size: string;
  limits: Limits;
}

/** Relatório HTML: referência | atual | diferença de cada quadro que mudou (imagens nas pastas ao lado). */
export function reportHtml(results: PluginResult[], info: ReportInfo): string {
  const shown = results.filter((r) => r.status !== 'igual');
  const same = results.filter((r) => r.status === 'igual');
  const fresh = shown.filter((r) => r.status === 'novo').length;
  const figure = (dir: string, r: PluginResult, s: ShotResult, title: string, extra = '') =>
    `<figure><img loading="lazy" src="${src(dir, r.id, s.label)}" alt="${escape(title)}"${extra}><figcaption>${title}</figcaption></figure>`;
  const blocks = shown.map((r) => {
    const rows = r.shots
      .filter((s) => s.status !== 'igual')
      .map((s) => {
        const d = s.diff;
        const numbers = d ? `${percent(d.changed)} dos pixels · média ${d.mean.toFixed(2)} · máx ${d.max}` : s.status === 'novo' ? 'sem referência' : 'não foi desenhado';
        const cells = [
          s.status !== 'novo' ? figure('referencia', r, s, 'Referência') : '<figure class="vazio">sem referência</figure>',
          s.status === 'novo'
            ? figure('atual', r, s, 'Atual')
            : s.status !== 'faltou'
              ? figure('atual', r, s, 'Atual (clique para piscar)', ` data-ref="${src('referencia', r.id, s.label)}"`)
              : '<figure class="vazio">não foi desenhado</figure>',
          d ? figure('diferenca', r, s, 'Diferença') : '<figure class="vazio"></figure>',
        ];
        return `<div class="quadro"><h3>${escape(s.label)} <small>${numbers}</small></h3><div class="lado">${cells.join('')}</div></div>`;
      });
    return `<section><h2><span class="tag ${r.status}">${r.status}</span> ${escape(r.id)}</h2>${r.error ? `<pre>${escape(r.error)}</pre>` : ''}${rows.join('')}</section>`;
  });
  const l = info.limits;
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Teste visual</title>
<style>
  :root { --bg: #111; --fg: #e8e8e8; --muted: #999; --card: #1c1c1c; --line: #333; }
  body { margin: 0; padding: 16px; background: var(--bg); color: var(--fg); font: 14px/1.4 system-ui, sans-serif; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 16px; margin: 0 0 8px; }
  h3 { font-size: 13px; margin: 8px 0 4px; font-weight: 600; }
  small, .info { color: var(--muted); font-weight: 400; }
  section { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 12px; margin: 12px 0; }
  .lado { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  @media (max-width: 700px) { .lado { grid-template-columns: 1fr; } }
  figure { margin: 0; }
  figure.vazio { display: grid; place-items: center; min-height: 80px; color: var(--muted); border: 1px dashed var(--line); }
  img { width: 100%; display: block; image-rendering: pixelated; border-radius: 4px; }
  figcaption { color: var(--muted); font-size: 12px; margin-top: 2px; }
  pre { white-space: pre-wrap; color: #f88; }
  .tag { font-size: 11px; text-transform: uppercase; padding: 1px 6px; border-radius: 4px; background: #444; }
  .tag.erro, .tag.sumiu { background: #a33; } .tag.mudou { background: #a63; } .tag.novo { background: #357; }
</style>
</head>
<body>
<h1>Teste visual dos plugins</h1>
<p class="info">${shown.filter((r) => r.status !== 'novo').length} com diferença, ${fresh ? `${fresh} sem referência, ` : ''}${same.length} iguais ·
referência de ${escape(info.reference)} · agora ${escape(info.now)} · ${escape(info.size)} · pixel mudado acima de ${l.pixel}/255,
quadro mudado acima de ${percent(l.changed)} dos pixels ou média acima de ${l.mean}</p>
${blocks.join('\n')}
${same.length ? `<details><summary>Iguais (${same.length})</summary><p class="info">${same.map((r) => escape(r.id)).join(', ')}</p></details>` : ''}
<script>
  // Clicar na imagem atual alterna com a referência, no mesmo lugar: a mudança salta aos olhos.
  for (const img of document.querySelectorAll('img[data-ref]')) {
    const atual = img.getAttribute('src');
    img.style.cursor = 'pointer';
    img.addEventListener('click', () => img.setAttribute('src', img.getAttribute('src') === atual ? img.dataset.ref : atual));
  }
</script>
</body>
</html>
`;
}
