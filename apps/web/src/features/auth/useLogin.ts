// The login form's behavior (T104, T300, T325, T342): one sign-in request at a time through the
// BFF, then the home of the user's role. A refusal shows the api's own message, which never says
// whether the email exists, with the request ID.
import type { CreateSessionInput } from "@clever/contracts/auth";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { describeError, type ErrorInfo } from "../../lib/errors";
import { session } from "../../lib/bff-client";

const HOME: Record<string, string> = {
  AGENT: "/agent",
  INVESTOR: "/investor",
  OPS: "/ops/packages",
};

export function useLogin() {
  const router = useRouter();
  const inFlight = useRef(false);
  const [isPending, setPending] = useState(false);
  const [error, setError] = useState<ErrorInfo | null>(null);

  async function submit(input: CreateSessionInput): Promise<void> {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      const { user } = await session.signIn(input);
      router.replace(HOME[user.role] ?? "/");
    } catch (err) {
      setError(describeError(err, "Sign-in failed. Try again."));
      inFlight.current = false;
      setPending(false);
    }
  }

  return { submit, isPending, error };
}
