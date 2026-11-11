'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { autoOnPrimaryColor, logoSrc } from '@/lib/brand';

export type LoginAgency = {
  id: string;
  name: string;
  shortName?: string | null;
  code?: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  loginVisible?: boolean;
  loginTileColor?: string | null;
};

const BLOBS = [
  '70% 30% 52% 48% / 42% 58% 42% 58%',
  '38% 62% 30% 70% / 60% 32% 68% 40%',
  '58% 42% 62% 38% / 34% 66% 36% 64%',
  '32% 68% 55% 45% / 52% 38% 62% 48%',
];

function monogram(a: LoginAgency) {
  const src = (a.shortName || a.code || a.name || '?').trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return parts.slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

export default function LoginAgencyGrid({
  agencies,
  variant = 'desktop',
}: {
  agencies: LoginAgency[];
  variant?: 'desktop' | 'mobile' | 'preview';
}) {
  const reduce = useReducedMotion();
  const visible = (agencies || []).filter((a) => a.loginVisible !== false);
  if (!visible.length) return null;
  const mobile = variant === 'mobile';
  const preview = variant === 'preview';
  const tile = mobile
    ? 'h-14 w-14'
    : preview
      ? 'h-16 w-16 sm:h-[4.5rem] sm:w-[4.5rem]'
      : 'h-36 w-36 xl:h-40 xl:w-40';
  const labelCls = mobile
    ? 'mt-1 max-w-[4.5rem] truncate text-center text-[10px] font-semibold text-on-brand/80'
    : preview
      ? 'mt-1.5 max-w-[5.5rem] truncate text-center text-[10px] font-semibold text-slate-600'
      : 'mt-2.5 max-w-[10rem] truncate text-center text-sm font-semibold text-on-brand/85';

  return (
    <div
      className={
        mobile
          ? 'flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
          : 'mx-auto grid max-w-md grid-cols-2 place-items-center gap-x-6 gap-y-7'
      }
      aria-label="Agencies"
    >
      {visible.map((a, i) => {
        const src = logoSrc(a.logoUrl, { fallback: false });
        const custom = a.loginTileColor && a.loginTileColor.trim() ? a.loginTileColor.trim() : '';
        const color = custom || a.primaryColor || 'rgb(var(--brand-600))';
        const ink = custom ? autoOnPrimaryColor(custom) : '#ffffff';
        const background = custom
          ? `linear-gradient(145deg, ${custom}, color-mix(in srgb, ${custom} 82%, #0f172a))`
          : `linear-gradient(145deg, ${color}, color-mix(in srgb, ${color} 70%, #0f172a))`;
        return (
          <motion.div
            key={a.id}
            className={mobile ? 'shrink-0' : 'flex flex-col items-center'}
            initial={reduce ? false : { opacity: 0, scale: 0.72, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={reduce ? { duration: 0 } : { delay: i * 0.09, type: 'spring', stiffness: 280, damping: 20 }}
          >
            <motion.div
              className={`relative overflow-hidden ${tile} ${mobile ? '' : 'shadow-[0_18px_40px_-18px_rgb(2_6_23/0.55)]'}`}
              style={{
                borderRadius: BLOBS[i % BLOBS.length],
                background,
              }}
              animate={
                reduce
                  ? undefined
                  : { y: [0, -5, 0, 4, 0], scale: [1, 1.03, 1, 0.99, 1] }
              }
              transition={
                reduce
                  ? undefined
                  : { duration: 5.2 + (i % 3) * 0.7, repeat: Infinity, ease: 'easeInOut', delay: i * 0.25 }
              }
              whileHover={reduce || mobile ? undefined : { y: -6, scale: 1.06 }}
            >
              <span className={`pointer-events-none absolute inset-0 ${custom ? 'bg-white/10' : 'bg-white/15'}`} />
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt="" className="relative h-full w-full object-cover p-2" />
              ) : (
                <span className="relative flex h-full w-full items-center justify-center px-1 text-center font-bold tracking-wide drop-shadow-sm" style={{ fontSize: mobile || preview ? 11 : 20, color: ink }}>
                  {monogram(a)}
                </span>
              )}
            </motion.div>
            <p className={labelCls} title={a.name}>{a.shortName || a.name}</p>
          </motion.div>
        );
      })}
    </div>
  );
}
