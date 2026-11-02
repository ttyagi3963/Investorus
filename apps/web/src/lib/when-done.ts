// Lets a form dialog wait for a useAction run (T385): the promise settles when the action does, so the
// dialog closes on success and, on a refusal such as a 409, stays open with what was typed and the
// same message and request ID the page shows. The run itself is unchanged.
import { describeError } from "./errors";

export function whenDone(
  run: (action: () => Promise<unknown>) => void,
  action: () => Promise<unknown>,
  fallback: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    run(() =>
      action().then(
        () => resolve(),
        (err: unknown) => {
          const { message, requestId } = describeError(err, fallback);
          reject(new Error(requestId ? `${message} (request ID ${requestId})` : message));
          throw err;
        },
      ),
    );
  });
}
