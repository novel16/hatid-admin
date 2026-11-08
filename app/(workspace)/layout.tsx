import { AdminWorkspace } from "@/features/workspace";
import type { ReactNode } from "react";

/** Reuse the same verified access boundary and responsive shell for workspace routes. */
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <AdminWorkspace>{children}</AdminWorkspace>;
}
