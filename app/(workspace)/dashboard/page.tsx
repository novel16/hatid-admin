import { AdminOverview } from "@/features/workspace";

// This child waits for the browser's verified admin session, rather than an instant private preview.
export const instant = false;

/** Render the real current account without fabricated rider counts or business permissions. */
export default function DashboardPage() {
  return <AdminOverview />;
}
