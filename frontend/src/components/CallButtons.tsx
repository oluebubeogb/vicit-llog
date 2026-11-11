'use client';

import { Phone, PhoneCall } from 'lucide-react';
import clsx from 'clsx';

/** PSTN / handset dial — never used for the in-app WebRTC ring. */
export function PhoneCallLink({
  phone,
  className,
  compact,
}: {
  phone?: string | null;
  className?: string;
  compact?: boolean;
}) {
  if (!phone) return null;
  return (
    <a
      href={`tel:${phone}`}
      className={clsx(compact ? 'btn-quiet inline-flex items-center justify-center gap-1 !px-2 !py-1 text-xs' : 'btn-quiet inline-flex items-center justify-center gap-1.5', className)}
    >
      <Phone size={compact ? 12 : 14} /> Phone call
    </a>
  );
}

/** In-app WebRTC ring (gate ↔ host). */
export function InAppCallButton({
  onClick,
  disabled,
  className,
  label = 'In-app call',
  compact,
}: {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  label?: string;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        compact ? 'btn-primary inline-flex items-center justify-center gap-1 !px-2 !py-1 text-xs' : 'btn-primary inline-flex items-center justify-center gap-1.5',
        className,
      )}
    >
      <PhoneCall size={compact ? 12 : 14} /> {label}
    </button>
  );
}
