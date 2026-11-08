"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  ListToolbar,
  Pagination,
  type PageSize,
} from "@/components/pagination";
import { Button, displayDate, Icon, Modal } from "@/components/ui";
import { useAdminAuth } from "@/features/auth";
import { AuthError, isRecord } from "@/lib/auth";

const VEHICLE_LABELS = {
  motorcycle: "Motorcycle",
  bicycle: "Bicycle",
  car: "Car",
  unset: "Not set",
} as const;

type VehicleFilter = "" | keyof typeof VEHICLE_LABELS;

interface Rider {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  vehicle: string | null;
  created_at: string | null;
}

interface RiderQuery {
  page: number;
  perPage: PageSize;
  search: string;
  vehicle: VehicleFilter;
}

interface RiderPage {
  rows: Rider[];
  total: number;
  lastPage: number;
}

type RiderResult =
  { query: RiderQuery; page: RiderPage } | { query: RiderQuery; error: string };
const INITIAL_QUERY: RiderQuery = {
  page: 1,
  perPage: 10,
  search: "",
  vehicle: "",
};

/** Send only directory filters and paging to the protected API. */
function riderParams(query: RiderQuery) {
  const params = new URLSearchParams({
    page: String(query.page),
    per_page: String(query.perPage),
  });
  if (query.search) params.set("q", query.search);
  if (query.vehicle) params.set("vehicle", query.vehicle);
  return params;
}

/** Validate profile fields before they become table or dialog content. */
function isRider(value: unknown): value is Rider {
  return (
    isRecord(value) &&
    typeof value.id === "number" &&
    Number.isSafeInteger(value.id) &&
    value.id > 0 &&
    typeof value.name === "string" &&
    typeof value.email === "string" &&
    (value.phone === null || typeof value.phone === "string") &&
    (value.vehicle === null || typeof value.vehicle === "string") &&
    (value.created_at === null || typeof value.created_at === "string")
  );
}

/** Accept only the requested server page so a malformed reply cannot show stale counts or rows. */
function readPage(payload: unknown, query: RiderQuery): RiderPage {
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.data) ||
    !payload.data.every(isRider) ||
    !isRecord(payload.meta)
  ) {
    throw new AuthError(
      "Hatid returned an unreadable rider list. Try again.",
      0,
    );
  }
  const {
    current_page: currentPage,
    per_page: perPage,
    last_page: lastPage,
    total,
  } = payload.meta;
  if (
    currentPage !== query.page ||
    perPage !== query.perPage ||
    typeof total !== "number" ||
    !Number.isSafeInteger(total) ||
    total < 0 ||
    lastPage !== Math.max(1, Math.ceil(total / query.perPage)) ||
    payload.data.length > query.perPage
  ) {
    throw new AuthError(
      "Hatid returned an unreadable rider page. Try again.",
      0,
    );
  }
  return { rows: payload.data, total, lastPage };
}

/** Preserve the distinction between a missing vehicle and a legacy vehicle value. */
function vehicleLabel(vehicle: string | null) {
  if (!vehicle) return VEHICLE_LABELS.unset;
  return Object.hasOwn(VEHICLE_LABELS, vehicle)
    ? VEHICLE_LABELS[vehicle as keyof typeof VEHICLE_LABELS]
    : "Other";
}

/** Show the same current profile returned in the directory using the shared native dialog. */
function RiderProfile({
  rider,
  onClose,
}: {
  rider: Rider;
  onClose: () => void;
}) {
  return (
    <Modal
      title={rider.name}
      description="Registered rider profile"
      onClose={onClose}
    >
      <dl className="profile-list rider-profile">
        <div>
          <dt>Full name</dt>
          <dd>{rider.name}</dd>
        </div>
        <div>
          <dt>Email address</dt>
          <dd>{rider.email}</dd>
        </div>
        <div>
          <dt>Phone number</dt>
          <dd>{rider.phone || "Not provided"}</dd>
        </div>
        <div>
          <dt>Vehicle</dt>
          <dd>
            <span className="pill pill-small">
              {vehicleLabel(rider.vehicle)}
            </span>
          </dd>
        </div>
        <div>
          <dt>Date joined</dt>
          <dd>{displayDate(rider.created_at, false)}</dd>
        </div>
      </dl>
      <div className="admin-modal-footer">
        <Button variant="secondary" onClick={onClose}>
          Done
        </Button>
      </div>
    </Modal>
  );
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
        const response = readPage(payload, query);
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

  /** Clear the query and vehicle filter while retaining the chosen entry size. */
  function clearFilters() {
    setDraft("");
    changeQuery({ search: "", vehicle: "" });
  }

  /** Retry the current controls without reviving their previous result. */
  function retry() {
    changeQuery({ page: query.page });
  }

  /** Return focus to the list through the native dialog close behavior. */
  function closeProfile() {
    setSelected(null);
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
          {(query.search || query.vehicle || draft) && (
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
              {query.search || query.vehicle
                ? "Try a different search or vehicle filter."
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
                <th scope="col">Vehicle</th>
                <th scope="col" className="rider-date-column">
                  Date joined
                </th>
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
                    <td>
                      <span className="pill pill-small">
                        {vehicleLabel(rider.vehicle)}
                      </span>
                    </td>
                    <td className="rider-date-column">
                      {displayDate(rider.created_at, false)}
                    </td>
                    <td>
                      <Button
                        variant="secondary"
                        className="rider-profile-button"
                        aria-label={`View profile for ${rider.name}`}
                        onClick={
                          /** Reuse the selected row so opening its profile makes no extra request. */
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
      {selected && <RiderProfile rider={selected} onClose={closeProfile} />}
    </>
  );
}
