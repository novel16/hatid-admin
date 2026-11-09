"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Pagination } from "@/components/pagination";
import { Button, displayDate, Modal } from "@/components/ui";
import { useAdminAuth } from "@/features/auth";
import {
  AuthError,
  type RiderStatus,
  type RiderStatusUpdate,
} from "@/lib/auth";
import {
  readActivity,
  readStatusResult,
  STATUS_LABELS,
  vehicleLabel,
  type Rider,
} from "@/lib/riders";

type ActivityQuery = { page: number };
type ActivityResult =
  | { query: ActivityQuery; data: ReturnType<typeof readActivity> }
  | { query: ActivityQuery; error: string };
type Proposal = Omit<RiderStatusUpdate, "reason">;

/** Keep the account status label and color consistent in the directory and profile. */
export function RiderStatusBadge({ status }: { status: RiderStatus }) {
  return (
    <span className={`pill pill-small rider-status-${status}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

/** Review the current rider profile and confirm one status transition at a time. */
export function RiderProfile({
  rider,
  onClose,
  onRefresh,
}: {
  rider: Rider;
  onClose: () => void;
  onRefresh: (updated?: Rider) => void;
}) {
  const { readRiderActivity, updateRiderStatus } = useAdminAuth();
  const riderId = rider.id;
  const [query, setQuery] = useState<ActivityQuery>({ page: 1 });
  const [result, setResult] = useState<ActivityResult | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(
    null,
  );
  const submitting = useRef<AbortController | null>(null);
  const current = result?.query === query ? result : null;
  const activity = current && "data" in current ? current.data : null;
  const error = current && "error" in current ? current.error : "";
  const profile = activity?.rider ?? rider;

  /** Load the selected rider's current revision and only the requested history page. */
  useEffect(() => {
    const controller = new AbortController();

    /** Keep the latest profile request in charge of the visible history and action. */
    async function load() {
      try {
        const payload = await readRiderActivity(
          riderId,
          query.page,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        const data = readActivity(payload, riderId, query.page);
        if (query.page > data.lastPage) {
          setQuery(
            /** Leave any newer page choice in place. */
            (latest) => (latest === query ? { page: data.lastPage } : latest),
          );
          return;
        }
        setResult({ query, data });
      } catch (cause) {
        if (!controller.signal.aborted)
          setResult({
            query,
            error:
              cause instanceof AuthError
                ? cause.message
                : "Unable to load rider activity.",
          });
      }
    }

    void load();
    /** Release an obsolete history read when its page or dialog changes. */
    return () => controller.abort();
  }, [query, readRiderActivity, riderId]);

  /** Discard a late response when navigation removes this profile. */
  useEffect(() => {
    /** Aborting the read of a mutation response never repeats the mutation. */
    return () => submitting.current?.abort();
  }, []);

  /** Freeze the exact revision shown when the administrator starts confirmation. */
  function proposeChange() {
    if (!activity || submitting.current) return;
    setNotice(null);
    setProposal({
      status: activity.rider.status === "active" ? "suspended" : "active",
      expected_revision: activity.rider.status_revision,
    });
  }

  /** Discard an unsubmitted reason and return to the current profile. */
  function cancelProposal() {
    setProposal(null);
    setReason("");
  }

  /** Retry a failed profile/history read without carrying forward its error. */
  function retryActivity() {
    setQuery({ page: query.page });
  }

  /** Send one confirmed transition and re-read authoritative state after an uncertain result. */
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!proposal || !activity || submitting.current) return;
    const explanation = reason.trim();
    if (!explanation) {
      setNotice({
        text: "Enter a reason for this status change.",
        error: true,
      });
      return;
    }
    if (proposal.expected_revision !== activity.rider.status_revision) {
      cancelProposal();
      setNotice({
        text: "The profile has a newer status. Review it before confirming again.",
        error: true,
      });
      return;
    }

    const values: RiderStatusUpdate = { ...proposal, reason: explanation };
    const controller = new AbortController();
    submitting.current = controller;
    setBusy(true);
    setNotice(null);
    try {
      const payload = await updateRiderStatus(
        riderId,
        values,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      const updated = readStatusResult(payload, riderId, values);
      cancelProposal();
      setNotice({
        text:
          updated.status === "suspended"
            ? "Rider suspended. Their sessions have ended."
            : "Rider reactivated. They can sign in again.",
        error: false,
      });
      onRefresh(updated);
      setQuery({ page: 1 });
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (cause instanceof AuthError && cause.status === 422) {
        setNotice({ text: cause.message, error: true });
        return;
      }
      cancelProposal();
      setNotice({
        text:
          cause instanceof AuthError && cause.status === 409
            ? "The rider status changed. Review the refreshed profile before confirming again."
            : "The status change could not be confirmed. Review the current status before trying again.",
        error: true,
      });
      onRefresh();
      setQuery({ page: 1 });
    } finally {
      submitting.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  const suspending = proposal?.status === "suspended";
  return (
    <Modal
      title={profile.name}
      description="Registered rider profile"
      onClose={onClose}
      closeDisabled={busy}
    >
      <dl className="profile-list">
        <div>
          <dt>Full name</dt>
          <dd>{profile.name}</dd>
        </div>
        <div>
          <dt>Email address</dt>
          <dd>{profile.email}</dd>
        </div>
        <div>
          <dt>Phone number</dt>
          <dd>{profile.phone || "Not provided"}</dd>
        </div>
        <div>
          <dt>Vehicle</dt>
          <dd>{vehicleLabel(profile.vehicle)}</dd>
        </div>
        <div>
          <dt>Date joined</dt>
          <dd>{displayDate(profile.created_at, false)}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            <RiderStatusBadge status={profile.status} />
          </dd>
        </div>
        {profile.suspended_at && (
          <div>
            <dt>Suspended on</dt>
            <dd>{displayDate(profile.suspended_at)}</dd>
          </div>
        )}
      </dl>

      <section className="rider-status-panel" aria-label="Account status">
        {notice && (
          <p
            className={`notice${notice.error ? " notice-error" : ""}`}
            role={notice.error ? "alert" : "status"}
          >
            {notice.text}
          </p>
        )}
        {!current && <p role="status">Checking current status and activity…</p>}
        {error && (
          <div className="status-read-error">
            <p role="alert">{error}</p>
            <Button variant="secondary" onClick={retryActivity}>
              Try again
            </Button>
          </div>
        )}
        {activity && !proposal && (
          <Button
            variant={profile.status === "active" ? "danger" : "primary"}
            onClick={proposeChange}
          >
            {profile.status === "active" ? "Suspend rider" : "Reactivate rider"}
          </Button>
        )}
        {proposal && (
          <form
            method="post"
            className="status-confirmation"
            onSubmit={submit}
            aria-busy={busy}
          >
            <h3>
              {suspending ? "Confirm suspension" : "Confirm reactivation"}
            </h3>
            <p>
              {suspending
                ? "Suspension blocks new sign-ins and ends this rider’s sessions."
                : "Reactivation lets this rider sign in and resume their work."}
            </p>
            <label className="field">
              Reason
              <textarea
                name="reason"
                value={reason}
                required
                maxLength={500}
                rows={3}
                disabled={busy}
                onChange={
                  /** Capture the administrator's reason for this specific transition. */
                  (event) => setReason(event.currentTarget.value)
                }
              />
            </label>
            <div className="status-confirmation-actions">
              <Button
                variant="secondary"
                onClick={cancelProposal}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant={suspending ? "danger" : "primary"}
                disabled={busy || !activity}
              >
                {busy
                  ? "Saving…"
                  : suspending
                    ? "Confirm suspension"
                    : "Confirm reactivation"}
              </Button>
            </div>
          </form>
        )}
      </section>

      <section className="rider-status-history" aria-label="Status activity">
        <h3>Status activity</h3>
        {activity && activity.rows.length === 0 && (
          <p>No status changes recorded yet.</p>
        )}
        {activity && activity.rows.length > 0 && (
          <ul>
            {activity.rows.map(
              /** Render the original decision and its recorded administrator. */
              (entry) => (
                <li key={entry.id}>
                  <strong>
                    {entry.status === "suspended" ? "Suspended" : "Reactivated"}
                  </strong>
                  <span>
                    By {entry.admin_name} (#{entry.admin_id}) ·{" "}
                    {displayDate(entry.created_at)}
                  </span>
                  <p>{entry.reason}</p>
                </li>
              ),
            )}
          </ul>
        )}
        {activity && (
          <Pagination
            compact
            page={query.page}
            perPage={10}
            total={activity.total}
            shown={activity.rows.length}
            pending={busy || Boolean(proposal)}
            onPageChange={
              /** Use the fixed compact pager for this profile's status history. */
              (page) => setQuery({ page })
            }
          />
        )}
      </section>
    </Modal>
  );
}
