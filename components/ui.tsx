import Image from "next/image";
import Link from "next/link";
import type { ButtonHTMLAttributes } from "react";

const iconPaths = {
  overview: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  account: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-2a8 8 0 0 1 16 0v2",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  logout: "M9 4H4v16h5m4-12 4 4-4 4m-5-4h13",
  shield: "m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6l8-3m-4 9 3 3 5-6",
  refresh: "M20 8a8 8 0 1 0 0 8m0-13v5h-5",
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
