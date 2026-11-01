// The login form's behavior (T104): one sign-in request at a time through the BFF, then the agent's
// home. A refusal shows the api's own message, which never says whether the email exists.
import type { CreateSessionInput } from "@clever/contracts/auth";
import { ApiError } from "@clever/contracts/client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { session } from "../../lib/bff-client";

export function useLogin() {
  const router = useRouter();
  const inFlight = useRef(false);
  const [isPending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(input: CreateSessionInput): Promise<void> {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      await session.signIn(input);
      router.replace("/agent");
    } catch (err) {
      setError(
        err instanceof ApiError && err.status < 500 ? err.message : "Sign-in failed. Try again.",
      );
      inFlight.current = false;
      setPending(false);
    }
  }

  return { submit, isPending, error };
}
