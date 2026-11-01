"use client";
// The in-app inbox in the investor header (T300): a button with the unread count opens a panel
// (Escape or a click outside closes it) with the notifications, newest first; opening one marks it
// read and goes to its package. The list refreshes every 15 seconds, and a polite live region
// announces when the unread count goes up, so a new match reaches screen reader users too.
import { PopoverPanel } from "@clever/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ErrorNotice } from "@/features/errors/ErrorNotice";
import { notifications } from "@/lib/bff-client";
import { describeError } from "@/lib/errors";

const inboxKey = ["notifications"] as const;

export function NotificationInbox() {
  const queryClient = useQueryClient();
  const { data, isError, error } = useQuery({
    queryKey: inboxKey,
    queryFn: () => notifications.list(),
    refetchInterval: 15_000,
  });
  const markRead = useMutation({
    mutationFn: (id: string) => notifications.markRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: inboxKey }),
  });
  const unread = data?.filter((n) => !n.read).length ?? 0;

  const previous = useRef<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    if (data === undefined) return;
    if (previous.current !== null && unread > previous.current) {
      setAnnouncement(`${unread} unread notification${unread === 1 ? "" : "s"}`);
    }
    previous.current = unread;
  }, [data, unread]);

  return (
    <>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <PopoverPanel
        triggerLabel={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
        panelLabel="Notifications"
      >
        {(close) => (
          <>
            {isError && (
              <ErrorNotice error={describeError(error, "Notifications could not be loaded.")} />
            )}
            {data?.length === 0 && <p className="text-muted">No notifications yet.</p>}
            <ul className="flex flex-col gap-stack-sm">
              {data?.map((n) => (
                <li key={n.id} className="flex flex-col gap-stack-sm">
                  <span className={n.read ? "text-label text-muted" : "text-label font-heading"}>
                    {n.read ? "" : "New: "}
                    {n.title}
                  </span>
                  <span className="text-label">{n.body}</span>
                  {n.packageId && (
                    <Link
                      href={`/investor/packages/${n.packageId}`}
                      className="text-label text-link underline"
                      onClick={() => {
                        if (!n.read) markRead.mutate(n.id);
                        close();
                      }}
                    >
                      Open the listing
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </PopoverPanel>
    </>
  );
}
