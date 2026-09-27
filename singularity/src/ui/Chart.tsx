import { useMemo, useRef, useState } from 'react';
import { fmtTick } from './format';

export interface Series {
  key: string;
  label: string;
  color: string;
  values: number[];
  dashed?: boolean;
}

interface Props {
  ticks: number[]; // x positions (simulation ticks)
  series: Series[];
  height?: number;
  format: (v: number) => string;
  yMax?: number;
  playhead?: number;
  xMax?: number;
  ariaLabel: string;
}

/**
 * Minimal SVG line chart following the dataviz rules: one y-axis, 2px lines, recessive
 * grid, crosshair + tooltip listing every series at the hovered x, direct end labels for
 * ≤ 4 series, and a legend whenever there are two or more series.
 */
export function LineChart({ ticks, series, height = 120, format, yMax, playhead, xMax, ariaLabel }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ i: number; px: number } | null>(null);
  const W = 340;
  const H = height;
  const pad = { l: 34, r: series.length <= 4 && series.length > 1 ? 58 : 10, t: 8, b: 18 };
  const x0 = ticks[0] ?? 0;
  const x1 = Math.max(xMax ?? ticks[ticks.length - 1] ?? 1, x0 + 1);
  const max = useMemo(() => {
    let m = yMax ?? 0;
    if (yMax === undefined) for (const s of series) for (const v of s.values) if (Number.isFinite(v) && v > m) m = v;
    return m > 0 ? niceMax(m) : 1;
  }, [series, yMax]);
  const sx = (t: number) => pad.l + ((t - x0) / (x1 - x0)) * (W - pad.l - pad.r);
  const sy = (v: number) => pad.t + (1 - Math.min(1, Math.max(0, v / max))) * (H - pad.t - pad.b);
  const paths = series.map((s) => {
    let d = '';
    s.values.forEach((v, i) => {
      if (!Number.isFinite(v)) return;
      d += `${d ? 'L' : 'M'}${sx(ticks[i]).toFixed(1)},${sy(v).toFixed(1)}`;
    });
    return d;
  });
  const onMove = (e: React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || !ticks.length) return;
    const x = ((e.clientX - r.left) / r.width) * W;
    const t = x0 + ((x - pad.l) / (W - pad.l - pad.r)) * (x1 - x0);
    let best = 0;
    let bd = Infinity;
    ticks.forEach((tk, i) => {
      const d = Math.abs(tk - t);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    setHover({ i: best, px: (sx(ticks[best]) / W) * r.width });
  };
  const yTicks = [0, max / 2, max];
  // End labels: avoid overlaps by nudging vertically.
  const ends = series
    .map((s) => ({ s, y: sy(lastFinite(s.values)) }))
    .sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 11) ends[k].y = ends[k - 1].y + 11;

  return (
    <div className="chart" ref={ref}>
      {series.length > 1 && (
        <div className="legend" aria-hidden="true">
          {series.map((s) => (
            <span key={s.key}>
              <i className="line" style={{ background: s.color, borderTop: s.dashed ? `2px dashed ${s.color}` : undefined, height: s.dashed ? 0 : undefined }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} onPointerMove={onMove} onPointerLeave={() => setHover(null)} style={{ height: H }}>
        <g className="grid">
          {yTicks.map((v) => (
            <line key={v} x1={pad.l} x2={W - pad.r} y1={sy(v)} y2={sy(v)} />
          ))}
        </g>
        <g className="axis">
          {yTicks.map((v) => (
            <text key={v} x={pad.l - 5} y={sy(v) + 3} textAnchor="end">
              {format(v)}
            </text>
          ))}
          <text x={pad.l} y={H - 3}>
            {fmtTick(x0).slice(2, 7)}
          </text>
          <text x={W - pad.r} y={H - 3} textAnchor="end">
            {fmtTick(x1).slice(2, 7)}
          </text>
        </g>
        {playhead !== undefined && playhead >= x0 && playhead <= x1 && <line x1={sx(playhead)} x2={sx(playhead)} y1={pad.t} y2={H - pad.b} stroke="rgba(255,255,255,0.35)" strokeDasharray="2 3" />}
        {paths.map((d, i) => (
          <path key={series[i].key} d={d} fill="none" stroke={series[i].color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={series[i].dashed ? '5 4' : undefined} />
        ))}
        {series.length > 1 &&
          series.length <= 4 &&
          ends.map(({ s, y }) => (
            <text key={s.key} x={W - pad.r + 5} y={y + 3} fill="var(--text-2)" fontSize={10}>
              {s.label.length > 11 ? s.label.slice(0, 10) + '…' : s.label}
            </text>
          ))}
        {hover && (
          <g>
            <line x1={sx(ticks[hover.i])} x2={sx(ticks[hover.i])} y1={pad.t} y2={H - pad.b} stroke="rgba(255,255,255,0.55)" />
            {series.map((s) => (Number.isFinite(s.values[hover.i]) ? <circle key={s.key} cx={sx(ticks[hover.i])} cy={sy(s.values[hover.i])} r={4} fill={s.color} stroke="#0b0f15" strokeWidth={2} /> : null))}
          </g>
        )}
      </svg>
      {hover && (
        <div className="tip" style={{ left: Math.min(hover.px + 10, (ref.current?.clientWidth ?? 300) - 150), top: 18 }}>
          <div className="muted mono" style={{ fontSize: 10.5 }}>
            {fmtTick(ticks[hover.i])}
          </div>
          {series.map((s) => (
            <div className="row" key={s.key}>
              <i style={{ background: s.color }} />
              <strong>{format(s.values[hover.i])}</strong>
              <span className="muted">{s.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function lastFinite(a: number[]): number {
  for (let i = a.length - 1; i >= 0; i--) if (Number.isFinite(a[i])) return a[i];
  return 0;
}

function niceMax(v: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return m * p;
}
