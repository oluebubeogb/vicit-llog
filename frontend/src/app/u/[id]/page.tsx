'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, getUser } from '@/lib/api';
import { ArrowLeft, User, Phone, Briefcase, X, ShieldCheck } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import Sheet from '@/components/ui/Sheet';
import StatusPill from '@/components/ui/StatusPill';
import Tooltip from '@/components/ui/Tooltip';
import { Empty, Field, Fields, SkeletonList } from '@/components/ui/Bits';
import { VisitorCard } from '@/components/InviteBits';
import { MODE_LABEL, relTime } from '@/lib/format';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

type Tab = 'invites' | 'entries' | 'declines' | 'exits';

function NotFoundBare() {
  useEffect(() => {
    document.title = 'Not found';
  }, []);
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <p className="text-lg font-semibold text-slate-500">Not found</p>
    </div>
  );
}

export default function PublicUserPage() {
  const params = useParams();
  const id = params?.id as string;
  const [profile, setProfile] = useState<any>(null);
  const [viewer, setViewer] = useState<any>(null);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [guest, setGuest] = useState<any | null>(null);
  const [photoPreview, setPhotoPreview] = useState(false);
  const [tab, setTab] = useState<Tab>('invites');

  useEffect(() => {
    if (!id) return;
    const u = getUser();
    setViewer(u);
    if (!u || (u.role !== 'ADMIN' && u.role !== 'GATE')) {
      setAllowed(false);
      setLoading(false);
      return;
    }
    setAllowed(true);
    api
      .publicProfile(id)
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="page">
        <div className="skeleton mb-4 h-56 !rounded-3xl" />
        <SkeletonList rows={4} />
      </div>
    );
  }

  if (!allowed || !profile) {
    // Intentionally bare: no explanation, no sign-in prompt, nothing that confirms the profile exists.
    return <NotFoundBare />;
  }

  const avatar = profile.avatarPath ? `${API}/users/avatar/${profile.avatarPath}` : null;

  const showGateTabs = viewer?.role === 'ADMIN' && profile.subjectIsGate && profile.gateActivity;

  const tabs: { id: Tab; label: string; count: number }[] = showGateTabs
    ? [
        { id: 'invites', label: 'Invites', count: profile.guests?.length || 0 },
        { id: 'entries', label: 'Entries', count: profile.gateActivity?.entries?.length || 0 },
        { id: 'declines', label: 'Declines', count: profile.gateActivity?.declines?.length || 0 },
        { id: 'exits', label: 'Exits', count: profile.gateActivity?.exits?.length || 0 },
      ]
    : [{ id: 'invites', label: 'Previous guests', count: profile.guests?.length || 0 }];

  function listForTab(): any[] {
    if (tab === 'entries') return profile.gateActivity?.entries || [];
    if (tab === 'declines') return profile.gateActivity?.declines || [];
    if (tab === 'exits') return profile.gateActivity?.exits || [];
    return profile.guests || [];
  }

  function photoSrc(path?: string) {
    return path ? `${API}/visitors/photo/${path}` : null;
  }

  const guests = profile.guests || [];
  const onSite = guests.filter((g: any) => g.status === 'ARRIVED').length;
  const lastVisit = guests.map((g: any) => g.enteredAt || g.createdAt).filter(Boolean).sort().pop();

  return (
    <div className="page">
      <div className="mb-4 flex items-center gap-3">
        <Tooltip content="Back">
          <button type="button" onClick={() => (typeof window !== 'undefined' ? window.history.back() : null)} className="back-btn" aria-label="Back">
            <ArrowLeft size={18} />
          </button>
        </Tooltip>
        <p className="eyebrow">Profile</p>
      </div>

      <div className="hero animate-in !pb-6 text-center">
        <Tooltip content={avatar ? 'Tap to enlarge' : 'No photo'}>
          <button type="button" onClick={() => avatar && setPhotoPreview(true)} className="mx-auto mb-3 block rounded-full ring-4 ring-white/30 transition hover:ring-white/60">
            <Avatar name={profile.fullName} src={avatar} size={96} ring={false} className="!text-2xl" />
          </button>
        </Tooltip>
        <h1 className="text-2xl font-bold">{profile.fullName}</h1>
        {profile.organisationName && <p className="mt-0.5 text-sm text-white/75">{profile.organisationName}</p>}
        <div className="mt-3 flex flex-wrap justify-center gap-2 text-xs">
          {profile.portfolio && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 ring-1 ring-white/20 backdrop-blur">
              <Briefcase size={12} /> {profile.portfolio}
            </span>
          )}
          {profile.phone && (
            <a href={`tel:${profile.phone}`} className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 ring-1 ring-white/20 backdrop-blur transition hover:bg-white/25">
              <Phone size={12} /> {profile.phone}
            </a>
          )}
          {profile.subjectIsGate && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-300/30 px-2.5 py-1 ring-1 ring-white/20">
              <ShieldCheck size={12} /> Gate officer
            </span>
          )}
        </div>
      </div>

      <div className="stagger -mt-5 mb-5 grid grid-cols-3 gap-2 px-3">
        {[
          { l: 'Guests', v: guests.length },
          { l: 'On site', v: onSite },
          { l: 'Last visit', v: lastVisit ? relTime(lastVisit) : '—' },
        ].map((x) => (
          <div key={x.l} className="card p-2.5 text-center">
            <p className="truncate text-base font-bold text-slate-900">{x.v}</p>
            <p className="text-[10px] uppercase tracking-wider text-slate-400">{x.l}</p>
          </div>
        ))}
      </div>

      {showGateTabs ? (
        <div className="-mx-4 mb-3 overflow-x-auto px-4">
          <div className="segmented">
            {tabs.map((t) => (
              <button key={t.id} type="button" data-active={tab === t.id} onClick={() => setTab(t.id)}>
                {t.label} <span className="opacity-70">{t.count}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="section-title">Previous guests</p>
      )}

      {listForTab().length === 0 ? (
        <Empty icon={<User size={22} />} title="No records" />
      ) : (
        <ul className="rows stagger">
          {listForTab().map((g: any) => (
            <li key={g.id}>
              <button type="button" onClick={() => setGuest(g)} className="row-link group">
                <Avatar name={g.fullName} src={photoSrc(g.photoPath)} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-slate-800">{g.fullName}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {g.invite?.purpose || 'Visit'}
                    {(g.enteredAt || g.createdAt) && ` · ${relTime(g.enteredAt || g.createdAt)}`}
                  </span>
                  {tab === 'declines' && g.deniedReason && <span className="block truncate text-xs text-rose-600">{g.deniedReason}</span>}
                </span>
                <StatusPill status={g.status} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Avatar preview */}
      {photoPreview && avatar && (
        <div className="fixed inset-0 z-[100] flex animate-in flex-col items-center justify-center bg-slate-950/90 p-4 backdrop-blur" onClick={() => setPhotoPreview(false)}>
          <button type="button" onClick={() => setPhotoPreview(false)} className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] rounded-full bg-white/15 p-2 text-white" aria-label="Close">
            <X size={24} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={avatar} alt="" className="max-h-[80vh] max-w-full rounded-3xl object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
          <p className="mt-3 text-sm text-white/80">{profile.fullName}</p>
        </div>
      )}

      {/* Guest / activity detail */}
      <Sheet open={!!guest} onClose={() => setGuest(null)} icon={<User size={20} />} title={guest?.fullName} subtitle={guest && <StatusPill status={guest.status} />}>
        {guest && (
          <div className="space-y-3">
            <VisitorCard v={guest} />
            <Fields>
              <Field label="Visit">{guest.invite?.purpose}</Field>
              <Field label="Category">{guest.invite?.category && <StatusPill status={guest.invite.category} />}</Field>
              <Field label="Host">{guest.invite?.host?.fullName}</Field>
              <Field label="Arrived by">{guest.entryMode && (MODE_LABEL[guest.entryMode] || guest.entryMode)}</Field>
              <Field label="Decline reason">{guest.deniedReason && <span className="text-rose-700">{guest.deniedReason}</span>}</Field>
            </Fields>
          </div>
        )}
      </Sheet>
    </div>
  );
}
