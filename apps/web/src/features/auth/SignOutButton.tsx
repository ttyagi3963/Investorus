"use client";
// The agent layout's sign-out button (T266): asks the BFF to clear the session cookie, then goes to
// the login page.
import { Button } from "@clever/ui";
import { useRouter } from "next/navigation";
import { session } from "@/lib/bff-client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      variant="secondary"
      onPress={async () => {
        await session.signOut();
        router.replace("/login");
      }}
    >
      Sign out
    </Button>
  );
}
