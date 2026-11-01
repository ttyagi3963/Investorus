"use client";
// The in-app inbox in the investor and agent headers (T300, T315, T329): a button with the unread count opens a panel
// (Escape or a click outside closes it) with the notifications, newest first, each marked New until
// read and showing when it arrived; opening one marks it
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
const formatTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

/** `packagesPath` is where this role's package pages live, for example `/agent/packages`. */
export function NotificationInbox({ packagesPath }: { packagesPath: string }) {
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
            <h2 className="font-heading text-heading-xs text-heading">Notifications</h2>
            {data?.length === 0 && <p className="text-body text-muted">No notifications yet.</p>}
            <ul className="flex flex-col">
              {data?.map((n) => (
                <li
                  key={n.id}
                  className="flex flex-col gap-stack-xs border-b border-subtle py-inset-sm last:border-b-0"
                >
                  <span className="flex items-center gap-inline-sm">
                    {!n.read && (
                      <>
                        <span aria-hidden="true" className="size-2 shrink-0 rounded-pill bg-action-primary" />
                        <span className="text-caption font-semibold text-link">New</span>
                      </>
                    )}
                    <span className={`text-body ${n.read ? "text-muted" : "font-semibold text-heading"}`}>
                      {n.title}
                    </span>
                  </span>
                  <span className="text-body">{n.body}</span>
                  <span className="flex flex-wrap items-center justify-between gap-inline-md">
                    <time dateTime={n.createdAt} className="text-helper text-muted">
                      {formatTime(n.createdAt)}
                    </time>
                    {n.packageId && (
                      <Link
                        href={`${packagesPath}/${n.packageId}`}
                        className="inline-flex min-h-touch items-center text-label text-link hover:text-link-hover"
                        onClick={() => {
                          if (!n.read) markRead.mutate(n.id);
                          close();
                        }}
                      >
                        Open it
                      </Link>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </PopoverPanel>
    </>
  );
}
