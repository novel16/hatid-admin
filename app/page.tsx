import { redirect } from "next/navigation";

/** Let the protected workspace decide whether the current browser should sign in. */
export default function HomePage() {
  redirect("/dashboard");
}
