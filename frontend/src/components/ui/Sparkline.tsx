/** Tiny dependency-free SVG sparkline with gradient area. */
export default function Sparkline({
  data,
  width = 96,
  height = 32,
  stroke = 'rgb(var(--brand-500))',
  fill = 'rgb(var(--brand-400))',
  className = '',
}: {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  className?: string;
}) {
  const id = `sl${Math.abs(data.reduce((a, b, i) => a + b * (i + 7), 13))}${width}`;
  if (!data.length) data = [0, 0];
  if (data.length === 1) data = [data[0], data[0]];
  const max = Math.max(1, ...data);
  const step = width / (data.length - 1);
  const pts = data.map((v, i) => [i * step, height - 3 - (v / max) * (height - 6)]);
  const line = pts
    .map(([x, y], i) => {
      if (!i) return `M${x},${y}`;
      const [px, py] = pts[i - 1];
      const cx = (px + x) / 2;
      return `C${cx},${py} ${cx},${y} ${x},${y}`;
    })
    .join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={fill} stopOpacity="0.45" />
          <stop offset="100%" stopColor={fill} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2.6" fill="white" stroke={stroke} strokeWidth="1.8" />
    </svg>
  );
}
