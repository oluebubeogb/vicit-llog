'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Lock, Mail, ShieldCheck } from 'lucide-react';
import { api, setToken, setUser } from '@/lib/api';
import InstallBanner from '@/components/InstallBanner';
import BrandMark from '@/components/BrandMark';
import FooterCredit from '@/components/FooterCredit';
import Tooltip from '@/components/ui/Tooltip';
import { Notice } from '@/components/ui/Bits';
import { useBrand } from '@/components/BrandProvider';
import { logoSrc } from '@/lib/brand';

export default function LoginPage() {
  const router = useRouter();
  const { brand } = useBrand();
  const login = brand.login || {};
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const logo = login.logoUrl || brand.logoUrl;
  const logoWidth = login.logoWidth || '180px';
  const watermark = login.watermarkUrl ? logoSrc(login.watermarkUrl, { fallback: false, version: brand.assetVersion }) : null;
  const headline = login.headline || brand.name;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await api.login(email, password);
      setToken(data.accessToken);
      setUser(data.user);
      if (data.mustChangePassword || data.user?.mustChangePassword) {
        router.replace('/change-password');
        return;
      }
      if (data.user.role === 'SUPER_ADMIN' || data.user.role === 'GLOBAL_ADMIN') router.replace('/platform');
      else if (data.user.role === 'GATE' || data.user.role === 'GLOBAL_GATE') router.replace('/gate');
      else router.replace('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="hero fixed inset-0 z-10 flex flex-col items-center justify-center overflow-y-auto !rounded-none px-6 pb-16 pt-[max(2rem,env(safe-area-inset-top))]">
      {watermark && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={watermark}
            alt=""
            className="max-w-none object-contain"
            style={{
              width: login.watermarkWidth || '70vw',
              height: login.watermarkHeight || '70vh',
              opacity: login.watermarkOpacity ?? 0.08,
            }}
          />
        </span>
      )}

      <div className="relative w-full max-w-sm">
        <div className="animate-in mb-6">
          <InstallBanner variant="login" />
        </div>

        <div className="stagger mb-7 flex flex-col items-center text-center">
          <div className="relative flex justify-center">
            <span className="absolute inset-0 animate-pulse-ring rounded-[26px]" />
            <BrandMark
              size={96}
              width={logoWidth}
              src={logoSrc(logo, { fallback: false, version: brand.assetVersion })}
              alt={headline || 'Sign in'}
              className="animate-float !bg-white/95"
            />
          </div>
          <h1 className="mt-5 text-[26px] font-bold tracking-tight">{headline}</h1>
          <p className="mt-1 text-sm text-on-brand/70">Visitor access & exit control</p>
        </div>

        <form onSubmit={handleSubmit} className="animate-in relative overflow-hidden rounded-[28px] border border-white/60 bg-white/95 p-6 text-slate-900 shadow-[0_30px_80px_-30px_rgb(2_6_23/0.7)] ring-1 ring-slate-200/80 backdrop-blur-xl">
          <div className="art-dots !opacity-[0.04]" />
          <h2 className="text-lg font-bold">Welcome back</h2>
          <p className="mb-5 text-sm text-slate-500">Sign in to continue</p>
          <div className="space-y-4">
            <label className="block">
              <span className="label">Email</span>
              <span className="relative block">
                <Mail size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" placeholder="you@organisation.com" className="input pl-10" required />
              </span>
            </label>
            <label className="block">
              <span className="label">Password</span>
              <span className="relative block">
                <Lock size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="Enter password" className="input pl-10 pr-12" required />
                <Tooltip content={show ? 'Hide password' : 'Show password'}>
                  <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-brand-50 hover:text-brand-600" aria-label={show ? 'Hide password' : 'Show password'}>
                    {show ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </Tooltip>
              </span>
            </label>

            {error && <Notice tone="error">{error}</Notice>}

            <button type="submit" disabled={loading} className="btn-primary w-full !py-3.5 text-base">
              {loading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-on-brand/40 border-t-on-brand" /> Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </div>
        </form>
        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-on-brand/60">
          <ShieldCheck size={13} /> Secured, encrypted access
        </p>
        <FooterCredit light className="mt-4 !text-on-brand/55" />
      </div>
    </div>
  );
}
