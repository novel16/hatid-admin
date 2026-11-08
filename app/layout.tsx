import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminAuthProvider } from "@/features/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Hatid Admin", template: "%s · Hatid Admin" },
  description: "The Hatid administrator workspace.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
  icons: { icon: "/hatid.svg" },
};

/** Mount one auth owner for route changes; server HTML contains no browser token or profile. */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <AdminAuthProvider>{children}</AdminAuthProvider>
      </body>
    </html>
  );
}
