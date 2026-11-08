"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";

const iconPaths = {
  overview: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  account: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-2a8 8 0 0 1 16 0v2",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  logout: "M9 4H4v16h5m4-12 4 4-4 4m-5-4h13",
  shield: "m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6l8-3m-4 9 3 3 5-6",
  refresh: "M20 8a8 8 0 1 0 0 8m0-13v5h-5",
  riders:
    "M15 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0M4 21v-2a7.5 7.5 0 0 1 15 0v2m-3-17a3.5 3.5 0 0 1 0 7m3 3a5 5 0 0 1 3 5v2",
  search: "M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0m-2 5 6 6",
  close: "m6 6 12 12M18 6 6 18",
  previous: "m15 5-7 7 7 7",
  next: "m9 5 7 7-7 7",
};

/** Reuse a small native icon set without adding a runtime icon dependency. */
export function Icon({
  name,
  size = 20,
}: {
  name: keyof typeof iconPaths;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={iconPaths[name]} />
    </svg>
  );
}

/** Keep the existing Hatid mark consistent across sign-in and the protected shell. */
export function Brand({ login = false }: { login?: boolean }) {
  return (
    <Link
      href={login ? "/login" : "/dashboard"}
      className="brand"
      aria-label="Hatid admin home"
      prefetch={false}
    >
      <Image src="/hatid.svg" width={42} height={42} alt="" priority />
      <span>
        hatid<span className="brand-label">ADMIN</span>
      </span>
    </Link>
  );
}

/** Share actual button styles and native keyboard/disabled behavior across admin actions. */
export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
}) {
  return (
    <button
      type={type}
      className={`button button-${variant} ${className}`}
      {...props}
    />
  );
}

/** Format verified account dates consistently across the workspace. */
export function displayDate(value: string | null, withTime = true) {
  if (!value) return "Unavailable";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("en-PH", {
        dateStyle: "medium",
        timeStyle: withTime ? "short" : undefined,
        timeZone: "Asia/Manila",
      }).format(date)
    : "Unavailable";
}

/** Reuse the native focus and backdrop behavior for a mounted admin dialog. */
export function Modal({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  /** Open after mount and release the native focus trap when the dialog is removed. */
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    /** React owns mounting, so cleanup only closes the browser dialog. */
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className="admin-modal"
      aria-labelledby={titleId}
      aria-describedby={description ? `${titleId}-description` : undefined}
      onCancel={
        /** Escape closes the same mounted dialog as its visible button. */
        (event) => {
          event.preventDefault();
          onClose();
        }
      }
      onClick={
        /** Only a click on the dialog's own backdrop dismisses it. */
        (event) => {
          if (event.target === event.currentTarget) onClose();
        }
      }
    >
      <div className="admin-modal-inner">
        <header className="admin-modal-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p id={`${titleId}-description`}>{description}</p>}
          </div>
          <Button
            variant="secondary"
            className="modal-close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <Icon name="close" size={18} />
          </Button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
