'use client';

import { forwardRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  /** Optional leading icon (rendered inside the field on the left). */
  icon?: ReactNode;
  /** Extra classes for the wrapper span. */
  wrapperClassName?: string;
};

/**
 * One password field for the whole app: login, first-sign-in / change password,
 * resets and confirmations. The eye is a real <button type="button"> so it never submits the form.
 */
const PasswordInput = forwardRef<HTMLInputElement, Props>(function PasswordInput(
  { icon, className = '', wrapperClassName = '', ...rest },
  ref,
) {
  const [show, setShow] = useState(false);
  const label = show ? 'Hide password' : 'Show password';
  return (
    <span className={`relative block ${wrapperClassName}`}>
      {icon && <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">{icon}</span>}
      <input
        ref={ref}
        {...rest}
        type={show ? 'text' : 'password'}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={`input ${icon ? 'pl-10' : ''} pr-12 ${className}`}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={label}
        aria-pressed={show}
        title={label}
        className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-brand-50 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
      >
        {show ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </span>
  );
});

export default PasswordInput;
