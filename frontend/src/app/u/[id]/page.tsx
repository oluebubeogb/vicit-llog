'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, getUser } from '@/lib/api';
import { ArrowLeft, User, Phone, Briefcase, X } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function PublicUserPage() {
  const params = useParams();
  const id = params?.id as string;
  const [profile, setProfile] = useState<any>(null);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [guest, setGuest] = useState<any | null>(null);

  useEffect(() => {
    if (!id) return;

    const u = getUser();
    // Only admin or gate may view — everyone else sees a silent not-found
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

  // Silent failure: same generic page for missing auth, wrong role, or missing profile
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
          <div className="mb-4 flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-brand-50 text-brand-600 ring-4 ring-brand-100">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              <User size={40} />
            )}
          </div>
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

      <hr className="my-8 border-slate-200" />

      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
        Previous guests
      </h3>
      {!profile.guests?.length ? (
        <p className="rounded-xl bg-slate-50 py-8 text-center text-sm text-slate-400">
          No guests yet
        </p>
      ) : (
        <ul className="space-y-2">
          {profile.guests.map((g: any) => (
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
                      src={`${API}/visitors/photo/${g.photoPath}`}
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
                    {g.status ? ` · ${g.status}` : ''}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {guest && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">Guest details</h2>
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
                    src={`${API}/visitors/photo/${guest.photoPath}`}
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
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
