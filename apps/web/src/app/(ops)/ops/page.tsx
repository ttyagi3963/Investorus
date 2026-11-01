// The operations console's root (T342): there is no page of its own, so /ops opens the packages.
import { redirect } from "next/navigation";

export default function OpsHome() {
  redirect("/ops/packages");
}
