import { RidersScreen } from "@/features/riders";

export const metadata = { title: "Riders" };
// The protected workspace verifies browser access before showing this page.
export const instant = false;

/** Render the directory through the existing admin layout. */
export default function RidersPage() {
  return <RidersScreen />;
}
