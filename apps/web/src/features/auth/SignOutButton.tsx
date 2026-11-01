"use client";
// The signed-in layouts' sign-out button (T266, T358): asks the BFF to clear the session cookie,
// forgets everything cached for this user, then goes to the login page. If that fails, it stays put and says so in an announced alert.
import { Button } from "@clever/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { session } from "@/lib/bff-client";

export function SignOutButton() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex items-center gap-inline-md">
      {failed && (
        <p role="alert" className="text-helper text-danger">
          Sign out failed. Try again.
        </p>
      )}
      <Button
        variant="secondary"
        size="sm"
        onPress={async () => {
          setFailed(false);
          try {
            await session.signOut();
          } catch {
            setFailed(true);
            return;
          }
          // Leave first: cleared while this area's queries are mounted, they would refetch without
          // a session and flash an error.
          router.replace("/login");
          queryClient.clear();
        }}
      >
        Sign out
      </Button>
    </div>
  );
}
