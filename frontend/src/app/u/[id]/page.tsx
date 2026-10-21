'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, getUser } from '@/lib/api';
import { ArrowLeft, User, Phone, Briefcase, X } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

type Tab = 'invites' | 'entries' | 'declines' | 'exits';

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
      <div className="flex min-h-[50vh] items-center justify-center text-slate-400">
        Loading…
      </div>
    );
  }

  if (!allowed || !profile) {
    return (
      <div className="px-4 pt-16 text-center">
        <p className="text-slate-500">Not found</p>
      </div>
    );
  }

  const avatar = profile.avatarPath
    ? `${API}/users/avatar/${profile.avatarPath}`
    : null;

  const showGateTabs =
    viewer?.role === 'ADMIN' && profile.subjectIsGate && profile.gateActivity;

  const tabs: { id: Tab; label: string; count: number }[] = showGateTabs
    ? [
        { id: 'invites', label: 'Invites', count: profile.guests?.length || 0 },
        {
          id: 'entries',
          label: 'Entries',
          count: profile.gateActivity?.entries?.length || 0,
        },
        {
          id: 'declines',
          label: 'Declines',
          count: profile.gateActivity?.declines?.length || 0,
        },
        {
          id: 'exits',
          label: 'Exits',
          count: profile.gateActivity?.exits?.length || 0,
        },
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

  return (
    <div className="mx-auto max-w-lg px-4 pt-6 pb-12">
      <div className="mb-6 flex items-center gap-3">
        <button
          type="button"
          onClick={() =>
            typeof window !== 'undefined' ? window.history.back() : null
          }
          className="rounded-full p-2 hover:bg-slate-100"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold">Profile</h1>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <button
            type="button"
            onClick={() => avatar && setPhotoPreview(true)}
            className="mb-4 flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-brand-50 text-brand-600 ring-4 ring-brand-100 transition hover:ring-brand-300"
            title={avatar ? 'Tap to enlarge' : undefined}
          >
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              <User size={40} />
            )}
          </button>
          <h2 className="text-xl font-bold text-slate-900">{profile.fullName}</h2>
          {profile.organisationName && (
            <p className="mt-1 text-sm text-slate-400">{profile.organisationName}</p>
          )}
        </div>

        <div className="mt-6 space-y-3">
          {profile.phone && (
            <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm">
              <Phone size={16} className="text-slate-400" />
              <a href={`tel:${profile.phone}`} className="text-slate-800">
                {profile.phone}
              </a>
            </div>
          )}
          {profile.portfolio && (
            <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm">
              <Briefcase size={16} className="text-slate-400" />
              <span className="text-slate-800">{profile.portfolio}</span>
            </div>
          )}
        </div>
      </div>

      <hr className="my-6 border-slate-200" />

      {showGateTabs && (
        <div className="mb-4 flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                tab === t.id
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {t.label}
              <span className="ml-1 opacity-80">({t.count})</span>
            </button>
          ))}
        </div>
      )}

      {!showGateTabs && (
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
          Previous guests
        </h3>
      )}

      {listForTab().length === 0 ? (
        <p className="rounded-xl bg-slate-50 py-8 text-center text-sm text-slate-400">
          No records
        </p>
      ) : (
        <ul className="space-y-2">
          {listForTab().map((g: any) => (
            <li key={g.id}>
              <button
                type="button"
                onClick={() => setGuest(g)}
                className="flex w-full items-center gap-3 rounded-xl border border-slate-100 bg-white p-3 text-left shadow-sm row-hover"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100">
                  {g.photoPath ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photoSrc(g.photoPath)!}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <User size={18} className="text-slate-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900">{g.fullName}</p>
                  <p className="truncate text-xs text-slate-400">
                    {g.invite?.purpose || 'Visit'}
                    {g.invite?.category ? ` · ${g.invite.category}` : ''}
                    {g.status ? ` · ${g.status}` : ''}
                  </p>
                  {tab === 'declines' && g.deniedReason && (
                    <p className="truncate text-xs text-red-600">{g.deniedReason}</p>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Avatar preview */}
      {photoPreview && avatar && (
        <div
          className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-black/85 p-4"
          onClick={() => setPhotoPreview(false)}
        >
          <button
            type="button"
            onClick={() => setPhotoPreview(false)}
            className="absolute right-4 top-4 rounded-full bg-white/15 p-2 text-white"
          >
            <X size={24} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={avatar}
            alt=""
            className="max-h-[80vh] max-w-full rounded-2xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <p className="mt-3 text-sm text-white/80">{profile.fullName}</p>
        </div>
      )}

      {/* Guest / activity detail */}
      {guest && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">Details</h2>
              <button
                type="button"
                onClick={() => setGuest(null)}
                className="rounded-full p-2 hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </div>
            <div className="mb-4 flex justify-center">
              <div className="h-28 w-28 overflow-hidden rounded-2xl bg-slate-100">
                {guest.photoPath ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoSrc(guest.photoPath)!}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-slate-300">
                    <User size={36} />
                  </div>
                )}
              </div>
            </div>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs text-slate-400">Name</dt>
                <dd className="font-medium">{guest.fullName}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Status</dt>
                <dd>{guest.status}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Purpose</dt>
                <dd>{guest.invite?.purpose || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Category</dt>
                <dd>{guest.invite?.category || '—'}</dd>
              </div>
              {guest.invite?.host?.fullName && (
                <div>
                  <dt className="text-xs text-slate-400">Host</dt>
                  <dd>{guest.invite.host.fullName}</dd>
                </div>
              )}
              {guest.entryMode && (
                <div>
                  <dt className="text-xs text-slate-400">Entry mode</dt>
                  <dd>{guest.entryMode}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-slate-400">Entered</dt>
                <dd>
                  {guest.enteredAt
                    ? new Date(guest.enteredAt).toLocaleString()
                    : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Exited</dt>
                <dd>
                  {guest.exitedAt
                    ? new Date(guest.exitedAt).toLocaleString()
                    : '—'}
                </dd>
              </div>
              {guest.deniedReason && (
                <div>
                  <dt className="text-xs text-slate-400">Decline reason</dt>
                  <dd className="text-red-700">{guest.deniedReason}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
