'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getUser, setUser, clearToken } from '@/lib/api';
import { useBrand } from '@/components/BrandProvider';
import { mergeTemplates, profileVars, renderList, renderTemplate } from '@/lib/profileTemplate';
import { isValidEmail } from '@/lib/email';
import { detectHumanInVideo } from '@/lib/detectHuman';
import { LogOut, User, Camera, Loader2, Send, Volume2, VolumeX } from 'lucide-react';
import { notificationSoundOn, setNotificationSound } from '@/lib/notifySound';
import { playChime, unlockRingtone } from '@/lib/ringtone';
import PageHeader from '@/components/ui/PageHeader';
import Sheet from '@/components/ui/Sheet';
import Avatar from '@/components/ui/Avatar';
import StatusPill from '@/components/ui/StatusPill';
import Tooltip, { InfoTip } from '@/components/ui/Tooltip';
import { Notice } from '@/components/ui/Bits';
import InstallBanner from '@/components/InstallBanner';
import StaffQrPanel from '@/components/StaffQrPanel';
import { roleLabel } from '@/lib/roleLabels';
import { CustomFieldInputs, useCustomFields } from '@/components/CustomFields';
import { platformHome } from '@/lib/navLinks';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function ProfilePage() {
  const router = useRouter();
  const [user, setLocal] = useState<any>(null);
  // v31: per-user "Notification sound" (server-side, on by default).
  const [soundOn, setSoundOn] = useState(true);
  const [soundSaving, setSoundSaving] = useState(false);
  useEffect(() => { setSoundOn(notificationSoundOn()); }, [user]);
  const toggleSound = async () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundSaving(true);
    try {
      await setNotificationSound(next);
      if (next) { unlockRingtone(); playChime(); }
    } catch {
      setSoundOn(!next);
    } finally {
      setSoundSaving(false);
    }
  };
  // v25: Super Admin profile header template (defaults = name, email, role badge, agency)
  const { brand: tplBrand } = useBrand();
  const myTpl = mergeTemplates((tplBrand as any)?.profileTemplates).myProfile;
  const myVars = profileVars(user, { roleText: roleLabel });
  const myProfileSubtitle = user ? renderTemplate(myTpl.subtitle, myVars) : '';
  const myBadges = user ? renderList(myTpl.badges, myVars) : [];
  const myMeta = user ? renderTemplate(myTpl.meta, myVars) : '';
  const [form, setForm] = useState({ fullName: '', phone: '', portfolio: '', email: '' });
  // Agency fields (system ones above + every active custom field, new ones included).
  const myFields = useCustomFields(null, true);
  const [custom, setCustom] = useState<Record<string, any>>({});
  const [customDirty, setCustomDirty] = useState(false);
  const [msg, setMsg] = useState('');
  const [pending, setPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [camError, setCamError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const u = getUser();
    if (!u) {
      router.replace('/login');
      return;
    }
    setLocal(u);
    setForm({
      fullName: u.fullName || '',
      phone: u.phone || '',
      portfolio: u.portfolio || '',
      email: u.email || '',
    });
    api
      .me()
      .then((me) => {
        setLocal({ ...u, ...me });
        setUser({ ...u, ...me });
        setForm({
          fullName: me.fullName || '',
          phone: me.phone || '',
          portfolio: me.portfolio || '',
          email: me.email || '',
        });
        setCustom(me.customFields && typeof me.customFields === 'object' ? me.customFields : {});
      })
      .catch(() => {});
  }, [router]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  // The video element only exists after cameraOn becomes true. Attach the stream
  // after React mounts that element; assigning it before then leaves a black preview.
  useEffect(() => {
    if (!cameraOn || !videoRef.current || !streamRef.current) return;
    const video = videoRef.current;
    video.srcObject = streamRef.current;
    video.play().catch(() => {
      setCamError(
        'The camera opened, but the preview could not start. Close other apps using the camera and try again.',
      );
    });
  }, [cameraOn]);

  function logout() {
    clearToken();
    router.replace('/login');
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }

  async function startCamera() {
    setCamError('');
    if (!window.isSecureContext) {
      setCamError(
        'Camera access requires a secure HTTPS connection (or localhost). Open Vicit using its HTTPS address, then allow camera access in your browser.',
      );
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamError('This browser does not support camera access. Update your browser and try again.');
      return;
    }

    try {
      // Stop any previous stream before requesting a fresh one.
      streamRef.current?.getTracks().forEach((track) => track.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOn(true);
    } catch (err: any) {
      const name = err?.name;
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setCamError(
          'Camera permission was denied. Allow camera access for this site in your browser settings, then try again.',
        );
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setCamError('No camera was found on this device.');
      } else if (name === 'NotReadableError' || name === 'TrackStartError') {
        setCamError(
          'The camera is busy or unavailable. Close other apps or browser tabs using it, then try again.',
        );
      } else {
        setCamError(err?.message || 'Could not open the camera. Check browser permissions.');
      }
    }
  }

  async function captureAndUpload() {
    if (!videoRef.current || !canvasRef.current) return;
    setCapturing(true);
    setCamError('');
    try {
      const ok = await detectHumanInVideo(videoRef.current);
      if (!ok) {
        setCamError(
          'No person detected. Centre your face in the frame and try again — empty scenes cannot be used.',
        );
        setCapturing(false);
        return;
      }
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const size = Math.min(video.videoWidth, video.videoHeight) || 480;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');

      // Centre-crop square (same as visitor verification)
      const sx = (video.videoWidth - size) / 2;
      const sy = (video.videoHeight - size) / 2;
      ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);

      const blob: Blob | null = await new Promise((res) =>
        canvas.toBlob((b) => res(b), 'image/jpeg', 0.92),
      );
      if (!blob) throw new Error('Could not capture image');
      const file = new File([blob], `avatar-${Date.now()}.jpg`, { type: 'image/jpeg' });
      const { avatarPath } = await api.uploadAvatar(file);
      const res = await api.requestProfileEdit({ avatarPath });
      if (res?.applied) {
        setPending(false);
        setLocal((cur: any) => ({ ...cur, avatarPath }));
        setUser({ ...getUser(), avatarPath });
        setMsg('Profile photo updated.');
      } else {
        setPending(true);
        setMsg('Profile photo submitted — pending admin approval.');
      }
      stopCamera();
      setPhotoOpen(false);
    } catch (err: any) {
      setCamError(err.message || 'Capture failed');
    } finally {
      setCapturing(false);
    }
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    if (form.email && !isValidEmail(form.email)) {
      setMsg('Please enter a valid email address.');
      return;
    }
    setSaving(true);
    try {
      const res = await api.requestProfileEdit({
        fullName: form.fullName.trim(),
        phone: form.phone.trim() || null,
        portfolio: form.portfolio.trim() || null,
        email: form.email.trim().toLowerCase(),
        ...(customDirty ? { customFields: custom } : {}),
      });
      setCustomDirty(false);
      if (res?.applied) {
        // Admins / Super Admins are the approvers: their edits apply straight away.
        setPending(false);
        const next = { ...getUser(), ...res.after };
        setUser(next);
        setLocal((cur: any) => ({ ...cur, ...res.after }));
        setMsg('Your details were updated.');
        api.me().then((me) => { setLocal((cur: any) => ({ ...cur, ...me })); setUser({ ...getUser(), ...me }); }).catch(() => {});
      } else {
        setPending(true);
        setMsg('Changes submitted — pending admin approval.');
      }
    } catch (err: any) {
      setMsg(err.message || 'Could not submit changes');
    } finally {
      setSaving(false);
    }
  }

  const avatarUrl = user?.avatarPath ? `${API}/users/avatar/${user.avatarPath}` : null;

  const closePhoto = () => {
    stopCamera();
    setPhotoOpen(false);
  };
  const isError = msg && !(pending || msg.includes('pending') || msg.includes('updated'));
  const approver = ['ADMIN', 'SUPER_ADMIN', 'GLOBAL_ADMIN'].includes(user?.role);

  return (
    <div className="page">
      <PageHeader back={platformHome(user?.role)} icon={<User size={20} />} title="Profile" subtitle="Your account and app" />

      <div className="hero animate-in mb-5">
        <div className="flex items-center gap-4">
          <Tooltip content="Take a new profile photo">
            <button
              type="button"
              onClick={() => {
                setPhotoOpen(true);
                setCamError('');
                setCameraOn(false);
              }}
              className="group relative shrink-0 rounded-full ring-4 ring-on-brand/25 transition hover:ring-on-brand/50"
            >
              <Avatar name={user?.fullName} src={avatarUrl} size={72} ring={false} className="!text-xl" />
              <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-white p-1.5 text-brand-600 shadow-lg transition group-hover:scale-110">
                <Camera size={13} />
              </span>
            </button>
          </Tooltip>
          <div className="min-w-0">
            <p className="line-clamp-2 break-words text-xl font-bold leading-tight" data-testid="my-profile-title">{(user && renderTemplate(myTpl.title, myVars)) || user?.fullName}</p>
            {myProfileSubtitle && <p className="truncate text-sm text-on-brand/75" data-testid="my-profile-subtitle">{myProfileSubtitle}</p>}
            {(myBadges.length > 0 || myMeta) && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {myBadges.map((b, i) => <span key={i} className="rounded-full bg-on-brand/20 px-2 py-0.5 text-[11px] font-semibold ring-1 ring-on-brand/25" data-testid="my-profile-badge">{b}</span>)}
                {myMeta && <span className="truncate text-[11px] text-on-brand/70" data-testid="my-profile-meta">{myMeta}</span>}
              </div>
            )}
          </div>
        </div>
      </div>

      <form onSubmit={submitEdit} className="surface animate-in mb-5 space-y-3">
        <p className="flex items-center gap-1.5 font-semibold text-slate-800">
          Edit details
          <InfoTip text={approver ? 'As an approver, your changes apply immediately and are recorded in the approvals history.' : 'Changes require admin approval before they apply.'} />
          {pending && <StatusPill className="ml-auto" status="PENDING" label="Pending approval" />}
        </p>
        <label className="block">
          <span className="label">Full name</span>
          <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="input" required />
        </label>
        <label className="block">
          <span className="label">Email</span>
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" required />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">Phone</span>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" />
          </label>
          <label className="block">
            <span className="label">Portfolio</span>
            <input value={form.portfolio} onChange={(e) => setForm({ ...form, portfolio: e.target.value })} placeholder="Portfolio" className="input" />
          </label>
        </div>
        {myFields.length > 0 ? (
          <div data-testid="profile-custom-fields">
            <CustomFieldInputs fields={myFields} value={custom} onChange={(v) => { setCustom(v); setCustomDirty(true); }} enforceRequired={false} />
          </div>
        ) : Array.isArray(user?.customFieldsList) && user.customFieldsList.length > 0 && (
          <div className="tile-muted space-y-1.5" data-testid="profile-custom-fields">
            {user.customFieldsList.map((f: any) => (
              <p key={f.key} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{f.label}</span>
                <span className="text-right font-medium text-slate-800">{Array.isArray(f.value) ? f.value.join(', ') : f.value === true ? 'Yes' : f.value === false ? 'No' : String(f.value)}</span>
              </p>
            ))}
          </div>
        )}
        {msg && <Notice tone={isError ? 'error' : msg.includes('updated') ? 'success' : 'warn'}>{msg}</Notice>}
        <button type="submit" disabled={saving} className="btn-primary w-full">
          <Send size={15} /> {saving ? (approver ? 'Saving…' : 'Submitting…') : approver ? 'Save changes' : 'Submit for approval'}
        </button>
      </form>

      <button
        type="button"
        role="switch"
        aria-checked={soundOn}
        disabled={soundSaving}
        onClick={toggleSound}
        data-testid="notification-sound"
        className="surface animate-in mb-5 flex w-full items-center gap-3 text-left transition hover:shadow-soft"
      >
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${soundOn ? 'bg-brand-50 text-brand-600' : 'bg-slate-100 text-slate-400'}`}>
          {soundOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1 text-sm font-semibold text-slate-800">
            Notification sound
            <InfoTip text="A short double tune when a new alert arrives while the app is open. Calls always ring." size={12} />
          </span>
          <span className="block text-xs text-slate-500">{soundOn ? 'Double tune on new alerts' : 'Silent — alerts still show'}</span>
        </span>
        <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${soundOn ? 'bg-gradient-to-r from-brand-500 to-brand-700' : 'bg-slate-200'}`}>
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${soundOn ? 'left-6' : 'left-1'}`} />
        </span>
      </button>

      {user && (
        <div className="mb-4">
          <StaffQrPanel fullName={user?.fullName || form.fullName} organisationName={user?.organisation?.name || user?.orgName} />
          <InstallBanner variant="profile" />
        </div>
      )}

      <button onClick={logout} className="btn w-full border border-rose-200 bg-gradient-to-r from-rose-50 to-white !py-3.5 text-rose-600 hover:border-rose-300 hover:from-rose-100">
        <LogOut size={18} />
        Sign out
      </button>

      {/* Camera-only profile photo — same flow as visitor verification */}
      <Sheet open={photoOpen} onClose={closePhoto} icon={<Camera size={20} />} title="Profile photo" subtitle={<span className="flex items-center gap-1">Camera only <InfoTip text="Face the camera in good light. Empty frames are rejected automatically. No file upload." size={12} /></span>}>
        <div className="relative aspect-square overflow-hidden rounded-2xl bg-slate-950 shadow-lift">
          {cameraOn ? (
            <>
              <video ref={videoRef} playsInline muted autoPlay className="h-full w-full scale-x-[-1] object-cover" />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-[70%] w-[55%] rounded-full border-2 border-dashed border-white/70 shadow-[0_0_0_999px_rgba(2,6,23,0.45)]" />
              </div>
            </>
          ) : avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-900 to-slate-950">
              <User size={64} className="text-white/30" />
            </div>
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>
        <div className="mt-4 space-y-3">
          {camError && <Notice tone="error">{camError}</Notice>}
          {!cameraOn ? (
            <button type="button" onClick={startCamera} className="btn-primary w-full !py-3.5">
              <Camera size={20} />
              Open camera
            </button>
          ) : (
            <div className="flex gap-2">
              <button type="button" onClick={stopCamera} className="btn-ghost flex-1">
                Cancel
              </button>
              <button type="button" onClick={captureAndUpload} disabled={capturing} className="btn-success flex-[2] !py-3">
                {capturing ? (
                  <>
                    <Loader2 size={18} className="animate-spin" /> Checking…
                  </>
                ) : (
                  <>
                    <Camera size={18} /> Capture
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </Sheet>
    </div>
  );
}
