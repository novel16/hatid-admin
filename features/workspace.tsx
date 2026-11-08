"use client";

import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Brand, Button, displayDate, Icon } from "@/components/ui";
import { SessionCheck, useAdminAuth } from "@/features/auth";

/** Reuse the same real destinations in the desktop sidebar and compact mobile navigation. */
function AdminNavigation({ current }: { current: "Overview" | "Riders" }) {
  return (
    <>
      <Link
        href="/dashboard"
        className={current === "Overview" ? "nav-link active" : "nav-link"}
        aria-current={current === "Overview" ? "page" : undefined}
        prefetch={false}
      >
        <Icon name="overview" /> Overview
      </Link>
      <Link
        href="/riders"
        className={current === "Riders" ? "nav-link active" : "nav-link"}
        aria-current={current === "Riders" ? "page" : undefined}
        prefetch={false}
      >
        <Icon name="riders" /> Riders
      </Link>
      <Link href="/dashboard#account" className="nav-link" prefetch={false}>
        <Icon name="account" /> My account
      </Link>
    </>
  );
}

/** Wait for server verification before rendering any admin workspace content. */
export function AdminWorkspace({ children }: { children: ReactNode }) {
  const auth = useAdminAuth();
  const router = useRouter();
  const current = usePathname() === "/riders" ? "Riders" : "Overview";

  /** Redirect only a confirmed guest, never a pending or unavailable verification. */
  useEffect(() => {
    if (auth.status === "guest") router.replace("/login");
  }, [auth.status, router]);

  if (auth.status === "checking" || auth.status === "unavailable")
    return <SessionCheck />;
  if (!auth.session) return <SessionCheck opening />;
  const user = auth.session.user;

  return (
    <div className="admin-layout">
      <aside className="sidebar">
        <Brand />
        <div className="sidebar-heading">WORKSPACE</div>
        <nav aria-label="Main navigation">
          <AdminNavigation current={current} />
        </nav>
        <div className="sidebar-bottom">
          <span className="sidebar-shield">
            <Icon name="shield" size={24} />
          </span>
          <strong>Your admin workspace</strong>
          <p>
            Keep your sign-in private.
            <br />
            Sign out on shared devices.
          </p>
        </div>
        <div className="sidebar-footer">
          Hatid <span>Admin workspace</span>
        </div>
      </aside>
      <div className="workspace-body">
        <header className="workspace-header">
          <span className="breadcrumb">
            Workspace <span>/</span> <strong>{current}</strong>
          </span>
          <div className="header-actions">
            <span className="admin-avatar" aria-hidden="true">
              {user.name.trim().charAt(0) || "A"}
            </span>
            <span className="header-identity">
              <strong>{user.name}</strong>
              <span>Administrator</span>
            </span>
            <Button variant="secondary" onClick={auth.signOut}>
              <Icon name="logout" size={17} />
              <span>Sign out</span>
            </Button>
          </div>
        </header>
        <nav className="mobile-nav" aria-label="Mobile navigation">
          <AdminNavigation current={current} />
        </nav>
        <main id="main-content" className="workspace-content">
          {auth.notice && (
            <p className="notice" role="status">
              {auth.notice}
            </p>
          )}
          {children}
        </main>
        <footer className="workspace-footer">
          <span>Hatid admin</span>
          <span>Deliver with clarity.</span>
        </footer>
      </div>
    </div>
  );
}

/** Display only the verified account/session; rider statistics require their separate authorized API feature. */
export function AdminOverview() {
  const { session, restore, signOut } = useAdminAuth();
  if (!session) return null;
  const user = session.user;
  const firstName = user.name.trim().split(/\s+/)[0] || "Administrator";

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR WORKSPACE</span>
          <h1>Welcome, {firstName}.</h1>
          <p>A clear place to start your day.</p>
        </div>
        <span className="pill">
          <span className="status-dot" /> Administrator access verified
        </span>
      </div>
      <section className="overview-banner" aria-labelledby="overview-title">
        <div>
          <span className="banner-label">HATID ADMIN</span>
          <h2 id="overview-title">You’re in the right place.</h2>
          <p>Review your account and manage your current sign-in.</p>
          <a className="banner-link" href="#account">
            View my account <Icon name="arrow" size={17} />
          </a>
        </div>
        <span className="banner-shield" aria-hidden="true">
          <Icon name="shield" size={62} />
        </span>
      </section>
      <div className="overview-grid">
        <section
          id="account"
          className="card account-card"
          aria-labelledby="account-title"
        >
          <div className="card-heading">
            <span className="icon-tile">
              <Icon name="account" />
            </span>
            <div>
              <h2 id="account-title">Your account</h2>
              <p>Your current Hatid administrator profile.</p>
            </div>
          </div>
          <dl className="profile-list">
            <div>
              <dt>Full name</dt>
              <dd>{user.name}</dd>
            </div>
            <div>
              <dt>Email address</dt>
              <dd>{user.email}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>
                <span className="pill pill-small">Administrator</span>
              </dd>
            </div>
            <div>
              <dt>Account created</dt>
              <dd>
                {displayDate(user.created_at)}{" "}
                <span className="date-zone">PHT</span>
              </dd>
            </div>
          </dl>
        </section>
        <section className="card session-card" aria-labelledby="session-title">
          <div className="card-heading">
            <span className="icon-tile">
              <Icon name="shield" />
            </span>
            <div>
              <h2 id="session-title">Current sign-in</h2>
              <p>Your access on this browser tab.</p>
            </div>
          </div>
          <div className="session-state">
            <span className="status-dot" /> Access verified
          </div>
          <div className="session-expiry">
            <span>Session expires</span>
            <strong>{displayDate(session.expires_at)}</strong>
            <span>Philippine time · UTC+8</span>
          </div>
          <Button variant="secondary" onClick={restore}>
            <Icon name="refresh" size={17} /> Recheck access
          </Button>
        </section>
      </div>
      <section className="privacy-note">
        <Icon name="shield" size={22} />
        <div>
          <h2>Keep your workspace private.</h2>
          <p>
            Refreshing checks your access with Hatid. Sign out before leaving a
            shared device.
          </p>
        </div>
        <Button variant="secondary" onClick={signOut}>
          Sign out <Icon name="logout" size={16} />
        </Button>
      </section>
    </>
  );
}
