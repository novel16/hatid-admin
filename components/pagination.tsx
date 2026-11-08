"use client";

import type { ReactNode } from "react";
import { Button, Icon } from "@/components/ui";

const ENTRY_SIZES = [10, 50, 100] as const;
export type PageSize = (typeof ENTRY_SIZES)[number];

/** Share the entry chooser and leave the right side for the list's search controls. */
export function ListToolbar({
  perPage,
  onSizeChange,
  children,
}: {
  perPage: PageSize;
  onSizeChange: (size: PageSize) => void;
  children: ReactNode;
}) {
  return (
    <div className="list-toolbar">
      <label className="pagination-entries">
        Show
        <select
          aria-label="Entries per page"
          value={perPage}
          onChange={
            /** Send only one of the shared entry choices to the list. */
            (event) =>
              onSizeChange(Number(event.currentTarget.value) as PageSize)
          }
        >
          {ENTRY_SIZES.map(
            /** Keep the available sizes consistent across admin lists. */
            (size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ),
          )}
        </select>
        entries
      </label>
      {children}
    </div>
  );
}

/** Reuse the rider list's boundary and neighboring-page pattern for large directories. */
function pageNumbers(page: number, lastPage: number): (number | string)[] {
  if (lastPage <= 5) {
    /** Show every page when the list fits in the footer. */
    return Array.from({ length: lastPage }, (_, index) => index + 1);
  }
  const visible = [...new Set([1, page - 1, page, page + 1, lastPage])]
    /** Include only pages that the server can return. */
    .filter((value) => value >= 1 && value <= lastPage)
    /** Keep the navigation in reading order. */
    .sort((left, right) => left - right);
  const numbers: (number | string)[] = [];
  let previous = 0;
  for (const value of visible) {
    if (previous && value - previous === 2) numbers.push(previous + 1);
    if (previous && value - previous > 2) numbers.push(`gap-${value}`);
    numbers.push(value);
    previous = value;
  }
  return numbers;
}

/** Render server pagination with compact mobile controls and an accurate result range. */
export function Pagination({
  page,
  perPage,
  total,
  shown,
  pending,
  onPageChange,
}: {
  page: number;
  perPage: PageSize;
  total: number | null;
  shown: number;
  pending: boolean;
  onPageChange: (page: number) => void;
}) {
  const lastPage = Math.max(1, Math.ceil((total ?? 0) / perPage));
  const current = Math.min(page, lastPage);
  const from = shown ? (current - 1) * perPage + 1 : 0;
  const to = shown ? from + shown - 1 : 0;
  const blocked = pending || total === null;

  /** Reject duplicate, unavailable and out-of-range page requests. */
  function change(next: number) {
    if (!blocked && next >= 1 && next <= lastPage && next !== current)
      onPageChange(next);
  }

  return (
    <nav
      className="list-pagination"
      aria-label="List pagination"
      aria-busy={pending}
    >
      <p role="status">
        {pending
          ? "Updating results…"
          : total === null
            ? ""
            : `Showing ${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()}`}
      </p>
      <div className="list-page-controls">
        <Button
          variant="secondary"
          aria-label="Previous page"
          aria-disabled={blocked || current === 1}
          onClick={
            /** Move back one server page. */
            () => change(current - 1)
          }
        >
          <Icon name="previous" size={15} />
          <span className="mobile-page-label">Prev</span>
        </Button>
        <div className="list-page-numbers">
          {pageNumbers(current, lastPage).map(
            /** Expose direct page buttons and passive gaps on wider screens. */
            (value) =>
              typeof value === "number" ? (
                <Button
                  key={value}
                  variant="secondary"
                  aria-label={`Page ${value}`}
                  aria-current={value === current ? "page" : undefined}
                  aria-disabled={blocked}
                  onClick={
                    /** Open the selected server page. */
                    () => change(value)
                  }
                >
                  {value}
                </Button>
              ) : (
                <span key={value} aria-hidden="true">
                  …
                </span>
              ),
          )}
        </div>
        <span className="mobile-page-label">
          Page {current} of {lastPage}
        </span>
        <Button
          variant="secondary"
          aria-label="Next page"
          aria-disabled={blocked || current === lastPage}
          onClick={
            /** Move forward one server page. */
            () => change(current + 1)
          }
        >
          <span className="mobile-page-label">Next</span>
          <Icon name="next" size={15} />
        </Button>
      </div>
    </nav>
  );
}
