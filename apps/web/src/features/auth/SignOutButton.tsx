"use client";
// The signed-in layouts' sign-out button (T266): asks the BFF to clear the session cookie, then goes to
// the login page. If that fails, it stays put and says so in an announced alert.
import { Button } from "@clever/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { session } from "@/lib/bff-client";

export function SignOutButton() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex items-center gap-inline-md">
      {failed && (
        <p role="alert" className="text-label text-danger">
          Sign out failed. Try again.
        </p>
      )}
      <Button
        variant="secondary"
        onPress={async () => {
          setFailed(false);
          try {
            await session.signOut();
          } catch {
            setFailed(true);
            return;
          }
          router.replace("/login");
        }}
      >
        Sign out
      </Button>
    </div>
  );
}
