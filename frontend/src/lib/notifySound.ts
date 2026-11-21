import { api, getUser, setUser } from './api';

/** v31: per-user "Notification sound" (server-side User.notificationSound, cached in the stored user). On by default. */
export function notificationSoundOn() {
  const u = getUser();
  return !u || u.notificationSound !== false;
}

export async function setNotificationSound(on: boolean) {
  const res: any = await api.setMyPreferences({ notificationSound: on });
  const u = getUser();
  if (u) setUser({ ...u, notificationSound: res?.notificationSound ?? on });
  return res?.notificationSound ?? on;
}

/** Same notification can arrive by SSE and by push; show/play it once. */
const seen: string[] = [];
export function firstTimeSeen(id?: string | null) {
  if (!id) return true;
  if (seen.includes(id)) return false;
  seen.push(id);
  if (seen.length > 200) seen.shift();
  return true;
}
