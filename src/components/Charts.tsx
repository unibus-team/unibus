import { useState } from 'react';

export interface BarDatum {
  label: string;
  value: number;
  highlight?: boolean;
}

export function SimpleBarChart({
  data,
  height = 170,
  unit = '',
}: {
  data: BarDatum[];
  height?: number;
  unit?: string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const maxVal = Math.max(1, ...data.map((d) => d.value));

  return (
    <div className="w-full">
      <div className="relative flex items-end gap-1.5 sm:gap-2" style={{ height }}>
        {/* Horizontal guide lines */}
        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
          {[1, 0.75, 0.5, 0.25, 0].map((tick) => (
            <div key={tick} className="flex items-center w-full border-b border-dashed border-[#E8E4D9]/80">
              <span className="text-[10px] text-[#8E8A80] tabular-nums pr-2 -translate-y-1.5 bg-white">
                {Math.round(maxVal * tick * 10) / 10}
              </span>
            </div>
          ))}
        </div>

        <div className="relative z-10 flex items-end justify-between w-full h-full pl-6 pt-2">
          {data.map((d, idx) => {
            const pct = maxVal === 0 ? 0 : (d.value / maxVal) * 100;
            return (
              <div
                key={d.label}
                className="relative flex-1 flex flex-col items-center justify-end h-full group px-0.5"
                onMouseEnter={() => setHovered(idx)}
                onMouseLeave={() => setHovered(null)}
              >
                {hovered === idx && d.value > 0 && (
                  <div className="absolute -top-7 z-20 bg-[#111111] text-white text-[11px] font-medium px-2 py-0.5 rounded whitespace-nowrap shadow-sm tabular-nums">
                    {d.label}: {d.value}
                    {unit}
                  </div>
                )}
                <div
                  className={`w-full max-w-[14px] rounded-t transition-all duration-150 ${
                    d.highlight
                      ? 'bg-[#FACC15]'
                      : d.value > 0
                      ? 'bg-[#111111] group-hover:bg-[#FACC15]'
                      : 'bg-transparent'
                  }`}
                  style={{ height: `${Math.max(d.value > 0 ? 6 : 0, pct)}%` }}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex justify-between pl-6 pt-2 text-[10px] text-[#7A766D] tabular-nums">
        {data
          .filter((_, i) => data.length <= 10 || i % Math.ceil(data.length / 8) === 0 || i === data.length - 1)
          .map((d) => (
            <span key={d.label} className="truncate">
              {d.label}
            </span>
          ))}
      </div>
    </div>
  );
}

export function SimpleLineChart({
  data,
  height = 170,
}: {
  data: { label: string; value: number }[];
  height?: number;
}) {
  const maxVal = Math.max(1, ...data.map((d) => d.value));
  const width = 460;
  const padX = 24;
  const padY = 16;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const points = data.map((d, i) => {
    const x = padX + (data.length <= 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
    const y = padY + innerH - (d.value / maxVal) * innerH;
    return { x, y, ...d };
  });

  const polyline = points.map((p) => `${p.x},${p.y}`).join(' ');
  const areaPath =
    points.length > 0
      ? `M ${points[0].x},${padY + innerH} L ${points.map((p) => `${p.x},${p.y}`).join(' L ')} L ${
          points[points.length - 1].x
        },${padY + innerH} Z`
      : '';

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible">
        <defs>
          <linearGradient id="unibusAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FACC15" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#FACC15" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = padY + innerH - t * innerH;
          return (
            <g key={t}>
              <line x1={padX} y1={y} x2={width - padX} y2={y} stroke="#ECE8DD" strokeDasharray="3 3" />
              <text x={0} y={y + 3} fontSize="9" fill="#8E8A80" className="tabular-nums">
                {Math.round(maxVal * t * 10) / 10}
              </text>
            </g>
          );
        })}

        {areaPath && <path d={areaPath} fill="url(#unibusAreaGrad)" />}
        {polyline && (
          <polyline fill="none" stroke="#111111" strokeWidth="2" strokeLinejoin="round" points={polyline} />
        )}
        {points.map((p) => (
          <circle
            key={p.label}
            cx={p.x}
            cy={p.y}
            r={p.value > 0 ? 3.5 : 2.2}
            fill={p.value > 0 ? '#FACC15' : '#FFFFFF'}
            stroke="#111111"
            strokeWidth="1.5"
          >
            <title>{`${p.label}: ${p.value}`}</title>
          </circle>
        ))}
      </svg>
      <div className="flex justify-between px-4 text-[10px] text-[#7A766D] tabular-nums">
        {data
          .filter((_, i) => i === 0 || i === Math.floor(data.length / 2) || i === data.length - 1)
          .map((d) => (
            <span key={d.label}>{d.label}</span>
          ))}
      </div>
    </div>
  );
}

export function HorizontalBarList({
  items,
  unit = 'bookings',
}: {
  items: { label: string; value: number; display?: string }[];
  unit?: string;
}) {
  const maxVal = Math.max(1, ...items.map((i) => i.value));

  return (
    <div className="space-y-3">
      {items.map((item, idx) => {
        const pct = Math.max(8, Math.round((item.value / maxVal) * 100));
        return (
          <div key={item.label} className="grid grid-cols-[120px_1fr] sm:grid-cols-[150px_1fr] items-center gap-3">
            <span className="text-xs text-[#55524B] truncate text-right" title={item.label}>
              {item.label}
            </span>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-5 bg-[#F4F1E8] rounded-md overflow-hidden flex items-center">
                <div
                  className={`h-full rounded-md transition-all duration-300 ${
                    idx === 0 ? 'bg-[#FACC15]' : 'bg-[#111111]'
                  }`}
                  style={{ width: `${pct}%` }}
                />
                <span className="ml-2 text-[11px] font-semibold text-[#111111] tabular-nums whitespace-nowrap pr-2">
                  {item.display ?? `${item.value} ${unit}`}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
