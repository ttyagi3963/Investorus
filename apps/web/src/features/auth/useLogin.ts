// The login form's behavior (T104, T300, T325, T342, T358): one sign-in request at a time through
// the BFF, then the home of the user's role, with nothing cached from an earlier user. A refusal shows the api's own message, which never says
// whether the email exists, with the request ID.
import type { CreateSessionInput } from "@clever/contracts/auth";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { describeError, type ErrorInfo } from "../../lib/errors";
import { session } from "../../lib/bff-client";
import { ROLE_HOME } from "./role-home";

export function useLogin() {
  const router = useRouter();
  const queryClient = useQueryClient();
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
      queryClient.clear();
      router.replace(ROLE_HOME[user.role] ?? "/");
    } catch (err) {
      setError(describeError(err, "Sign-in failed. Try again."));
      inFlight.current = false;
      setPending(false);
    }
  }

  return { submit, isPending, error };
}
