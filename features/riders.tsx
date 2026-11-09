"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  ListToolbar,
  Pagination,
  type PageSize,
} from "@/components/pagination";
import { Button, displayDate, Icon } from "@/components/ui";
import { useAdminAuth } from "@/features/auth";
import { RiderProfile, RiderStatusBadge } from "@/features/rider-profile";
import { AuthError, type RiderStatus } from "@/lib/auth";
import {
  isRider,
  readPage,
  STATUS_LABELS,
  VEHICLE_LABELS,
  vehicleLabel,
  type Rider,
  type RiderPage,
} from "@/lib/riders";

type VehicleFilter = "" | keyof typeof VEHICLE_LABELS;

interface RiderQuery {
  page: number;
  perPage: PageSize;
  search: string;
  vehicle: VehicleFilter;
  status: "" | RiderStatus;
}

type RiderResult =
  | { query: RiderQuery; page: RiderPage<Rider> }
  | { query: RiderQuery; error: string };
const INITIAL_QUERY: RiderQuery = {
  page: 1,
  perPage: 10,
  search: "",
  vehicle: "",
  status: "",
};

/** Send only directory filters and paging to the protected API. */
function riderParams(query: RiderQuery) {
  const params = new URLSearchParams({
    page: String(query.page),
    per_page: String(query.perPage),
  });
  if (query.search) params.set("q", query.search);
  if (query.vehicle) params.set("vehicle", query.vehicle);
  if (query.status) params.set("status", query.status);
  return params;
}

/** Load and display the authorized server page with independent search, error and profile states. */
export function RidersScreen() {
  const { readRiders } = useAdminAuth();
  const [query, setQuery] = useState(INITIAL_QUERY);
  const [draft, setDraft] = useState("");
  const [result, setResult] = useState<RiderResult | null>(null);
  const [selected, setSelected] = useState<Rider | null>(null);
  const current = result?.query === query ? result : null;
  const page = current && "page" in current ? current.page : null;
  const error = current && "error" in current ? current.error : "";
  const pending = current === null;

  /** Each query object is a new attempt, even when its values match an earlier search. */
  useEffect(() => {
    const controller = new AbortController();

    /** Ignore outdated results and move to the last available page after a count changes. */
    async function load() {
      try {
        const payload = await readRiders(riderParams(query), controller.signal);
        if (controller.signal.aborted) return;
        const response = readPage(payload, query.page, query.perPage, isRider);
        if (query.page > response.lastPage) {
          setQuery(
            /** Keep a more recent search or filter selection in charge. */
            (latest) =>
              latest === query ? { ...query, page: response.lastPage } : latest,
          );
          return;
        }
        setResult({ query, page: response });
      } catch (cause) {
        if (controller.signal.aborted) return;
        setResult({
          query,
          error:
            cause instanceof AuthError
              ? cause.message
              : "Unable to load riders. Try again.",
        });
      }
    }

    void load();
    /** Cancel the previous network read when a new view or route takes over. */
    return () => controller.abort();
  }, [query, readRiders]);

  /** Filter and entry-size changes start from the first page. */
  function changeQuery(changes: Partial<RiderQuery>) {
    setSelected(null);
    setQuery(
      /** Preserve the other applied list controls. */
      (previous) => ({ ...previous, page: 1, ...changes }),
    );
  }

  /** Apply the typed search with Enter or the Search button. */
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    changeQuery({ search: draft.trim() });
  }

  /** Clear search and both filters while retaining the chosen entry size. */
  function clearFilters() {
    setDraft("");
    changeQuery({ search: "", vehicle: "", status: "" });
  }

  /** Retry the current controls without reviving their previous result. */
  function retry() {
    changeQuery({ page: query.page });
  }

  /** Return focus to the list through the native dialog close behavior. */
  function closeProfile() {
    setSelected(null);
  }

  /** Reload the filtered list after a status action while leaving its profile open. */
  function refreshDirectory(updated?: Rider) {
    if (updated) setSelected(updated);
    setQuery(
      /** Preserve the active filters while refreshing membership and totals. */
      (previous) => ({ ...previous }),
    );
  }

  return (
    <>
      <div className="page-heading riders-heading">
        <div>
          <span className="eyebrow">DIRECTORY</span>
          <h1>Riders</h1>
          <p>Find registered riders and view their contact details.</p>
        </div>
      </div>
      <section className="card riders-card" aria-label="Registered riders">
        <div className="riders-filters">
          <label className="rider-vehicle-filter">
            Vehicle
            <select
              value={query.vehicle}
              onChange={
                /** Refresh the first page with the selected vehicle mode. */
                (event) =>
                  changeQuery({
                    vehicle: event.currentTarget.value as VehicleFilter,
                  })
              }
            >
              <option value="">All vehicles</option>
              {Object.entries(VEHICLE_LABELS).map(
                /** Include the filter for older profiles without a vehicle. */
                ([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ),
              )}
            </select>
          </label>
          <label className="rider-vehicle-filter">
            Status
            <select
              value={query.status}
              onChange={
                /** Start at the first page of the selected account status. */
                (event) =>
                  changeQuery({
                    status: event.currentTarget.value as RiderQuery["status"],
                  })
              }
            >
              <option value="">All statuses</option>
              <option value="active">{STATUS_LABELS.active}</option>
              <option value="suspended">{STATUS_LABELS.suspended}</option>
            </select>
          </label>
          {(query.search || query.vehicle || query.status || draft) && (
            <Button variant="secondary" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
        <ListToolbar
          perPage={query.perPage}
          onSizeChange={
            /** Ask Laravel for the new page size rather than slicing the current response. */
            (perPage) => changeQuery({ perPage })
          }
        >
          <form className="rider-search" role="search" onSubmit={search}>
            <label className="rider-search-field">
              <Icon name="search" size={17} />
              <input
                type="search"
                aria-label="Search riders by name, email or phone"
                placeholder="Name, email or phone"
                maxLength={100}
                value={draft}
                onChange={
                  /** Keep text editable until the search is submitted. */
                  (event) => setDraft(event.currentTarget.value)
                }
              />
            </label>
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>
        </ListToolbar>

        {pending && (
          <div className="riders-state" role="status">
            <p>Loading riders…</p>
          </div>
        )}
        {error && (
          <div className="riders-state">
            <h2>Couldn’t load riders</h2>
            <p role="alert">{error}</p>
            <Button variant="secondary" onClick={retry}>
              Try again
            </Button>
          </div>
        )}
        {page && !page.rows.length && (
          <div className="riders-state">
            <span className="icon-tile">
              <Icon name="riders" />
            </span>
            <h2>No riders found</h2>
            <p>
              {query.search || query.vehicle || query.status
                ? "Try a different search or filter."
                : "Riders appear here after they register."}
            </p>
          </div>
        )}
        {page && page.rows.length > 0 && (
          <table className="riders-table">
            <thead>
              <tr>
                <th scope="col">Rider</th>
                <th scope="col" className="rider-phone-column">
                  Phone
                </th>
                <th scope="col" className="rider-vehicle-column">
                  Vehicle
                </th>
                <th scope="col" className="rider-date-column">
                  Date joined
                </th>
                <th scope="col">Status</th>
                <th scope="col">Profile</th>
              </tr>
            </thead>
            <tbody>
              {page.rows.map(
                /** Render exactly the records in this authorized server page. */
                (rider) => (
                  <tr key={rider.id}>
                    <td>
                      <div className="rider-identity">
                        <span className="admin-avatar" aria-hidden="true">
                          {rider.name.trim().charAt(0) || "R"}
                        </span>
                        <div>
                          <strong>{rider.name}</strong>
                          <span>{rider.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="rider-phone-column">{rider.phone || "—"}</td>
                    <td className="rider-vehicle-column">
                      <span className="pill pill-small">
                        {vehicleLabel(rider.vehicle)}
                      </span>
                    </td>
                    <td className="rider-date-column">
                      {displayDate(rider.created_at, false)}
                    </td>
                    <td>
                      <RiderStatusBadge status={rider.status} />
                    </td>
                    <td>
                      <Button
                        variant="secondary"
                        className="rider-profile-button"
                        aria-label={`View profile for ${rider.name}`}
                        onClick={
                          /** Open this rider and load their current status and activity. */
                          () => setSelected(rider)
                        }
                      >
                        View
                        <span className="rider-profile-label"> profile</span>
                        <Icon name="next" size={14} />
                      </Button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        )}

        {!error && (
          <Pagination
            page={query.page}
            perPage={query.perPage}
            total={
              page?.total ??
              (pending && result && "page" in result ? result.page.total : null)
            }
            shown={page?.rows.length ?? 0}
            pending={pending}
            onPageChange={
              /** Load the selected page with the same applied filters. */
              (nextPage) => changeQuery({ page: nextPage })
            }
          />
        )}
      </section>
      {selected && (
        <RiderProfile
          key={selected.id}
          rider={selected}
          onClose={closeProfile}
          onRefresh={refreshDirectory}
        />
      )}
    </>
  );
}
