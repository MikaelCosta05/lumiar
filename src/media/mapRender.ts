import { assetUrl } from '../assetUrl';
import { mercator, routePoints } from '../project/maps';
import type { TextClip } from '../project/text';
import { elementDataReady } from './elementData';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Contorno de um país (já na projeção de Mercator) e a caixa em volta, para pular o que está fora da vista. */
interface Ring {
  points: Float32Array;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

let world: Ring[] | null = null;
let loading: Promise<void> | null = null;

interface Topology {
  transform: { scale: [number, number]; translate: [number, number] };
  arcs: [number, number][][];
  objects: { countries: { geometries: { type: string; arcs: number[][] | number[][][] }[] } };
}

/** Lê o mapa-múndi (TopoJSON do Natural Earth, 1:50 milhões) uma vez. */
export function loadWorld(): Promise<void> {
  loading ??= fetch(assetUrl('maps/countries-50m.json'))
    .then((r) => r.json() as Promise<Topology>)
    .then((topo) => {
      const { scale, translate } = topo.transform;
      // Os arcos vêm em deltas inteiros: acumula e converte para longitude/latitude.
      const arcs = topo.arcs.map((arc) => {
        let x = 0;
        let y = 0;
        return arc.map(([dx, dy]) => {
          x += dx;
          y += dy;
          return mercator(y * scale[1] + translate[1], x * scale[0] + translate[0]);
        });
      });
      const rings: Ring[] = [];
      const ring = (indexes: number[]) => {
        const pts: number[] = [];
        for (const index of indexes) {
          const arc = index >= 0 ? arcs[index] : [...arcs[~index]].reverse();
          arc.forEach(([x, y], k) => {
            if (k > 0 || pts.length === 0) pts.push(x, y);
          });
        }
        // Terras que cruzam a linha de data (Rússia, Fiji) pulam de uma ponta do mapa para a outra:
        // o contorno continua "do outro lado" (x passa de 1), e as cópias do mundo ao lado completam.
        // A Antártida dá a volta inteira e fica como está.
        const unwrapped = pts.slice();
        for (let i = 2; i < unwrapped.length; i += 2) {
          while (unwrapped[i] - unwrapped[i - 2] > 0.5) unwrapped[i] -= 1;
          while (unwrapped[i - 2] - unwrapped[i] > 0.5) unwrapped[i] += 1;
        }
        let span = [Infinity, -Infinity];
        for (let i = 0; i < unwrapped.length; i += 2) span = [Math.min(span[0], unwrapped[i]), Math.max(span[1], unwrapped[i])];
        if (span[1] - span[0] < 0.9) for (let i = 0; i < pts.length; i++) pts[i] = unwrapped[i];
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (let i = 0; i < pts.length; i += 2) {
          minX = Math.min(minX, pts[i]);
          maxX = Math.max(maxX, pts[i]);
          minY = Math.min(minY, pts[i + 1]);
          maxY = Math.max(maxY, pts[i + 1]);
        }
        rings.push({ points: Float32Array.from(pts), minX, minY, maxX, maxY });
      };
      for (const g of topo.objects.countries.geometries) {
        if (g.type === 'Polygon') (g.arcs as number[][]).forEach(ring);
        else if (g.type === 'MultiPolygon') (g.arcs as number[][][]).forEach((poly) => poly.forEach(ring));
      }
      world = rings;
      elementDataReady();
    })
    .catch((error) => {
      console.warn('[Lumiar] mapa-múndi não carregou', error);
      loading = null;
    });
  return loading;
}

const THEMES = {
  dark: { ocean: '#0d1626', land: '#1d2a3c', border: '#2f4058', label: '#ffffff', labelBg: 'rgba(0,0,0,0.55)', grid: 'rgba(255,255,255,0.04)' },
  light: { ocean: '#cfe3f3', land: '#f6f3ea', border: '#c9c1a9', label: '#1d1d1f', labelBg: 'rgba(255,255,255,0.85)', grid: 'rgba(0,0,0,0.04)' },
  paper: { ocean: '#e5d7b8', land: '#f5eedb', border: '#b49f74', label: '#4a3a1f', labelBg: 'rgba(245,238,219,0.9)', grid: 'rgba(74,58,31,0.06)' },
};

const smooth = (p: number) => p * p * (3 - 2 * p);

/** Ponto e direção na curva de uma perna da viagem (avião faz um arco; carro vai reto). */
function legPoint(a: { x: number; y: number }, b: { x: number; y: number }, p: number, bend: number) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  // Ponto de controle para o lado "de cima" da linha.
  const cx = mx + dy * bend * (dx >= 0 ? 1 : -1);
  const cy = my - Math.abs(dx) * bend - Math.abs(dy) * bend * 0.2;
  const q = 1 - p;
  const x = q * q * a.x + 2 * q * p * cx + p * p * b.x;
  const y = q * q * a.y + 2 * q * p * cy + p * p * b.y;
  const tx = 2 * q * (cx - a.x) + 2 * p * (b.x - cx);
  const ty = 2 * q * (cy - a.y) + 2 * p * (b.y - cy);
  return { x, y, angle: Math.atan2(ty, tx) };
}

/**
 * Rota animada: o mapa enquadra a viagem toda, a linha vai se desenhando cidade a cidade com o
 * veículo na ponta, e cada cidade ganha um alfinete e o nome quando é alcançada.
 * Desenhado em volta do centro (a origem já está no lugar do elemento).
 */
export function drawMap(ctx: Ctx, clip: TextClip, local: number, size: number, W: number, H: number): void {
  const route = clip.route;
  if (!route) return;
  if (!world) void loadWorld();
  const theme = THEMES[route.theme] ?? THEMES.dark;
  const stops = routePoints(route.stops);
  const accent = clip.style.color;

  // Enquadramento: a caixa da viagem com folga, no formato do vídeo; afasta devagar ao longo do clipe.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of stops) {
    minX = Math.min(minX, s.x);
    maxX = Math.max(maxX, s.x);
    minY = Math.min(minY, s.y);
    maxY = Math.max(maxY, s.y);
  }
  if (!stops.length) [minX, maxX, minY, maxY] = [0.2, 0.45, 0.45, 0.7];
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const aspect = W / H;
  let spanX = Math.max(maxX - minX, 0.012) * 1.6;
  let spanY = Math.max(maxY - minY, 0.012) * 1.9;
  if (spanX / spanY > aspect) spanY = spanX / aspect;
  else spanX = spanY * aspect;
  const zoomOut = 1.12 - 0.12 * smooth(Math.min(1, local / Math.max(0.1, clip.duration)));
  spanX /= zoomOut;
  spanY /= zoomOut;
  const k = W / spanX;
  const toScreen = (x: number, y: number): [number, number] => [(x - cx) * k, (y - cy) * k];

  ctx.save();
  ctx.beginPath();
  ctx.rect(-W / 2, -H / 2, W, H);
  ctx.clip();
  ctx.fillStyle = theme.ocean;
  ctx.fillRect(-W / 2, -H / 2, W, H);

  // Linhas de latitude/longitude bem fracas (dão profundidade ao mar).
  ctx.strokeStyle = theme.grid;
  ctx.lineWidth = 1;
  for (let lon = -180; lon <= 180; lon += 10) {
    const [x] = toScreen(mercator(0, lon)[0], 0);
    if (x < -W / 2 || x > W / 2) continue;
    ctx.beginPath();
    ctx.moveTo(x, -H / 2);
    ctx.lineTo(x, H / 2);
    ctx.stroke();
  }
  for (let lat = -80; lat <= 80; lat += 10) {
    const [, y] = toScreen(0, mercator(lat, 0)[1]);
    if (y < -H / 2 || y > H / 2) continue;
    ctx.beginPath();
    ctx.moveTo(-W / 2, y);
    ctx.lineTo(W / 2, y);
    ctx.stroke();
  }

  // Terra (o mundo é desenhado também uma volta para cada lado, para rotas que cruzam o Pacífico).
  if (world) {
    const viewMinX = cx - spanX / 2;
    const viewMaxX = cx + spanX / 2;
    const viewMinY = cy - spanY / 2;
    const viewMaxY = cy + spanY / 2;
    ctx.fillStyle = theme.land;
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = Math.max(0.6, size * 0.025);
    ctx.lineJoin = 'round';
    const path = new Path2D();
    for (const shift of [-1, 0, 1]) {
      for (const r of world) {
        if (r.maxX + shift < viewMinX || r.minX + shift > viewMaxX || r.maxY < viewMinY || r.minY > viewMaxY) continue;
        const p = r.points;
        // Contornos minúsculos na tela são pulados (ilhotas viram ruído).
        if ((r.maxX - r.minX) * k < 1.5 && (r.maxY - r.minY) * k < 1.5) continue;
        let [x, y] = toScreen(p[0] + shift, p[1]);
        path.moveTo(x, y);
        let lastX = x;
        let lastY = y;
        for (let i = 2; i < p.length; i += 2) {
          [x, y] = toScreen(p[i] + shift, p[i + 1]);
          if (Math.abs(x - lastX) + Math.abs(y - lastY) < 0.8) continue;
          path.lineTo(x, y);
          lastX = x;
          lastY = y;
        }
        path.closePath();
      }
    }
    ctx.fill(path);
    ctx.stroke(path);
  }

  // Tempo: pausa no começo e no fim; o meio é a viagem, dividida pelas pernas conforme a distância.
  const pause = Math.min(0.4, Math.max(0, route.pause)) * clip.duration;
  const travel = Math.max(0.1, clip.duration - pause * 2);
  const progress = Math.min(1, Math.max(0, (local - pause) / travel));
  const legs = stops.slice(1).map((b, i) => Math.hypot(b.x - stops[i].x, b.y - stops[i].y) + 1e-6);
  const total = legs.reduce((a, b) => a + b, 0);
  const bend = route.vehicle === 'car' ? 0 : route.vehicle === 'ship' ? 0.12 : 0.22;
  let reached = 0;
  let head: { x: number; y: number; angle: number } | null = null;
  let acc = 0;
  const lineW = Math.max(2, size * 0.09);

  ctx.lineCap = 'round';
  for (let i = 0; i < legs.length; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    const from = acc / total;
    acc += legs[i];
    const to = acc / total;
    const p = progress <= from ? 0 : progress >= to ? 1 : smooth((progress - from) / (to - from));
    if (p <= 0) break;
    // A linha da perna, até onde o veículo chegou.
    ctx.strokeStyle = accent;
    ctx.lineWidth = lineW;
    ctx.setLineDash(route.theme === 'paper' ? [lineW * 2.2, lineW * 1.6] : []);
    ctx.beginPath();
    const steps = 48;
    for (let s = 0; s <= steps * p; s++) {
      const pt = legPoint(a, b, s / steps, bend);
      const [x, y] = toScreen(pt.x, pt.y);
      if (s === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    const end = legPoint(a, b, p, bend);
    const [ex, ey] = toScreen(end.x, end.y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.setLineDash([]);
    head = { x: ex, y: ey, angle: end.angle };
    if (p >= 1) reached = i + 1;
  }

  // Alfinetes e nomes das cidades já alcançadas (a primeira aparece desde o começo).
  ctx.font = `700 ${size * 0.55}px "Inter Variable", sans-serif`;
  ctx.textBaseline = 'middle';
  stops.forEach((s, i) => {
    if (i > reached) return;
    const reachedAt = i === 0 ? 0 : pause + (legs.slice(0, i).reduce((a, b) => a + b, 0) / total) * travel;
    const pop = Math.min(1, Math.max(0, (local - reachedAt) / 0.35));
    const grow = pop < 1 ? 1 + Math.sin(pop * Math.PI) * 0.4 : 1;
    const [x, y] = toScreen(s.x, s.y);
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(x, y, size * 0.2 * grow, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = size * 0.06;
    ctx.stroke();
    // Nome numa etiqueta (do lado oposto ao da linha, para não cobrir).
    const label = s.city.name;
    const tw = ctx.measureText(label).width;
    const padX = size * 0.3;
    const right = i === stops.length - 1 ? x > 0 : (stops[i + 1]?.x ?? s.x) < s.x;
    const lx = right ? x + size * 0.45 : x - size * 0.45 - tw - padX * 2;
    ctx.globalAlpha = pop;
    ctx.fillStyle = theme.labelBg;
    ctx.beginPath();
    ctx.roundRect(lx, y - size * 0.45, tw + padX * 2, size * 0.9, size * 0.2);
    ctx.fill();
    ctx.fillStyle = theme.label;
    ctx.fillText(label, lx + padX, y + size * 0.02);
    ctx.globalAlpha = 1;
  });

  // Veículo na ponta da linha.
  if (head && route.vehicle !== 'none' && progress < 1) {
    ctx.save();
    ctx.translate(head.x, head.y);
    ctx.font = `${size * 1.1}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (route.vehicle === 'plane') {
      // O emoji ✈️ aponta para cima e para a direita (45°).
      ctx.rotate(head.angle + Math.PI / 4);
      ctx.fillText('✈️', 0, 0);
    } else {
      // Carro e navio olham para a esquerda: espelha quando vão para a direita.
      if (Math.cos(head.angle) > 0) ctx.scale(-1, 1);
      ctx.fillText(route.vehicle === 'car' ? '🚗' : '🚢', 0, -size * 0.3);
    }
    ctx.restore();
  }
  ctx.restore();
}
