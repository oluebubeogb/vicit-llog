/** Faint, fixed, branded background artwork (topographic lines + orbs). Purely decorative. */
export default function BackgroundArt() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -right-32 -top-40 h-[520px] w-[520px] rounded-full bg-gradient-to-br from-brand-200/50 to-accent-200/10 blur-3xl animate-float" />
      <div className="absolute -left-40 top-1/3 h-[420px] w-[420px] rounded-full bg-gradient-to-tr from-accent-200/40 to-violet-200/10 blur-3xl" style={{ animation: 'float 11s ease-in-out infinite reverse' }} />
      <div className="absolute -bottom-40 right-0 h-[360px] w-[360px] rounded-full bg-gradient-to-tl from-emerald-100/40 to-brand-100/10 blur-3xl" />
      <svg className="absolute inset-0 h-full w-full opacity-[0.07]" preserveAspectRatio="xMidYMid slice" viewBox="0 0 400 800">
        <defs>
          <linearGradient id="bgLines" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" style={{ stopColor: "rgb(var(--brand-600))" }} />
            <stop offset="1" style={{ stopColor: "rgb(var(--accent-600))" }} />
          </linearGradient>
        </defs>
        <g fill="none" stroke="url(#bgLines)" strokeWidth="0.8">
          {Array.from({ length: 9 }).map((_, i) => (
            <path
              key={i}
              d={`M-20 ${120 + i * 70} C 80 ${60 + i * 70}, 160 ${190 + i * 70}, 260 ${120 + i * 70} S 380 ${70 + i * 70}, 440 ${130 + i * 70}`}
            />
          ))}
          {Array.from({ length: 5 }).map((_, i) => (
            <circle key={`c${i}`} cx="360" cy="40" r={40 + i * 34} />
          ))}
        </g>
      </svg>
    </div>
  );
}
