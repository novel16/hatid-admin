import { AdminLogin } from "@/features/auth";

// Authentication is intentionally resolved in the browser before this screen becomes interactive.
export const instant = false;

/** Keep the public route separate from the protected workspace. */
export default function LoginPage() {
  return <AdminLogin />;
}
