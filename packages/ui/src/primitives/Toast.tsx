"use client";
// Toasts (T422): a short confirmation in a bar across the bottom of the screen that fades in, then fades
// away within 5 seconds, so the page a user lands on can say what just happened. React Aria's region
// announces each toast to screen readers, pauses the timer while it is hovered or focused (the fade
// pauses with it), and gives the close button keyboard access.
import {
  Button,
  Text,
  UNSTABLE_Toast as AriaToast,
  UNSTABLE_ToastContent as ToastContent,
  UNSTABLE_ToastQueue as ToastQueue,
  UNSTABLE_ToastRegion as ToastRegion,
} from "react-aria-components";
import { FOCUS_RING } from "./styles.js";

type ToastMessage = { title: string };

/** The app's one queue: any screen adds to it, and the one Toaster shows it. */
const queue = new ToastQueue<ToastMessage>({ maxVisibleToasts: 3 });

export function showToast(title: string) {
  queue.add({ title }, { timeout: 5000 });
}

/** Mount once, at the root of the app. */
export function Toaster() {
  return (
    <ToastRegion queue={queue} className="fixed inset-x-0 bottom-0 z-20 flex flex-col outline-none">
      {({ toast }) => (
        <AriaToast
          toast={toast}
          className={`flex w-full animate-toast items-center justify-between gap-inline-md bg-inverse px-inset-xl py-inset-md text-inverse shadow-card hover:animation-paused focus-within:animation-paused motion-reduce:animate-none ${FOCUS_RING}`}
        >
          <ToastContent>
            <Text slot="title" className="text-body">
              {toast.content.title}
            </Text>
          </ToastContent>
          <Button
            slot="close"
            aria-label="Dismiss"
            className={`rounded-control px-inset-sm text-body-lg text-inverse-muted data-hovered:text-inverse ${FOCUS_RING}`}
          >
            ×
          </Button>
        </AriaToast>
      )}
    </ToastRegion>
  );
}
