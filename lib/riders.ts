import {
  AuthError,
  isRecord,
  type RiderStatus,
  type RiderStatusUpdate,
} from "./auth.ts";

export const VEHICLE_LABELS = {
  motorcycle: "Motorcycle",
  bicycle: "Bicycle",
  car: "Car",
  unset: "Not set",
} as const;

export const STATUS_LABELS: Record<RiderStatus, string> = {
  active: "Active",
  suspended: "Suspended",
};

export interface Rider {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  vehicle: string | null;
  created_at: string | null;
  status: RiderStatus;
  status_revision: number;
  suspended_at: string | null;
}

interface RiderActivity {
  id: number;
  status: RiderStatus;
  reason: string;
  admin_id: number;
  admin_name: string;
  created_at: string;
}

export interface RiderPage<T> {
  rows: T[];
  total: number;
  lastPage: number;
}

/** Admit only positive integer identities returned by the API. */
function isId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/** Accept the two real status values for display and confirmation. */
function isStatus(value: unknown): value is RiderStatus {
  return value === "active" || value === "suspended";
}

/** Read nullable profile text without treating an omitted field as verified. */
function isNullableText(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

/** Verify profile fields and their revision before enabling a status action. */
export function isRider(value: unknown): value is Rider {
  return (
    isRecord(value) &&
    isId(value.id) &&
    typeof value.name === "string" &&
    typeof value.email === "string" &&
    isNullableText(value.phone) &&
    isNullableText(value.vehicle) &&
    isNullableText(value.created_at) &&
    isStatus(value.status) &&
    typeof value.status_revision === "number" &&
    Number.isSafeInteger(value.status_revision) &&
    value.status_revision >= 0 &&
    isNullableText(value.suspended_at) &&
    (value.status === "suspended") === (value.suspended_at !== null)
  );
}

/** Verify the displayed attribution and reason on each activity row. */
function isActivity(value: unknown): value is RiderActivity {
  return (
    isRecord(value) &&
    isId(value.id) &&
    isStatus(value.status) &&
    typeof value.reason === "string" &&
    isId(value.admin_id) &&
    typeof value.admin_name === "string" &&
    typeof value.created_at === "string"
  );
}

/** Accept the requested Laravel page and the specific resource fields expected by its view. */
export function readPage<T>(
  payload: unknown,
  page: number,
  perPage: number,
  isItem: (value: unknown) => value is T,
): RiderPage<T> {
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.data) ||
    !payload.data.every(isItem) ||
    !isRecord(payload.meta)
  ) {
    throw new AuthError(
      "Hatid returned unreadable rider records. Try again.",
      0,
    );
  }
  const {
    current_page: currentPage,
    per_page: pageSize,
    last_page: lastPage,
    total,
  } = payload.meta;
  if (
    currentPage !== page ||
    pageSize !== perPage ||
    typeof total !== "number" ||
    !Number.isSafeInteger(total) ||
    total < 0 ||
    lastPage !== Math.max(1, Math.ceil(total / perPage)) ||
    payload.data.length > perPage
  ) {
    throw new AuthError(
      "Hatid returned an unreadable rider page. Try again.",
      0,
    );
  }
  return { rows: payload.data, total, lastPage };
}

/** Keep the activity page and its current profile tied to the selected rider. */
export function readActivity(payload: unknown, riderId: number, page: number) {
  if (
    !isRecord(payload) ||
    !isRider(payload.rider) ||
    payload.rider.id !== riderId
  ) {
    throw new AuthError(
      "Hatid returned an unreadable rider profile. Try again.",
      0,
    );
  }
  return { ...readPage(payload, page, 10, isActivity), rider: payload.rider };
}

/** Confirm that the server applied this exact transition before reporting success. */
export function readStatusResult(
  payload: unknown,
  riderId: number,
  update: RiderStatusUpdate,
): Rider {
  if (
    !isRecord(payload) ||
    !isRider(payload.data) ||
    payload.data.id !== riderId ||
    payload.data.status !== update.status ||
    payload.data.status_revision !== update.expected_revision + 1
  ) {
    throw new AuthError("Hatid did not confirm this rider status change.", 0);
  }
  return payload.data;
}

/** Distinguish an unset vehicle from a legacy value on both list and detail views. */
export function vehicleLabel(vehicle: string | null) {
  if (!vehicle) return VEHICLE_LABELS.unset;
  return Object.hasOwn(VEHICLE_LABELS, vehicle)
    ? VEHICLE_LABELS[vehicle as keyof typeof VEHICLE_LABELS]
    : "Other";
}
