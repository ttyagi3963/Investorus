"use client";
// The in-app inbox in the investor header (T300): a button with the unread count opens the list of
// notifications, newest first; opening one marks it read and goes to its package. The list is React
// Query server state, refreshed every 15 seconds so a new match shows up without a reload.
import { Button } from "@clever/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { ErrorNotice } from "@/features/errors/ErrorNotice";
import { notifications } from "@/lib/bff-client";
import { describeError } from "@/lib/errors";

const inboxKey = ["notifications"] as const;

export function NotificationInbox() {
  const [open, setOpen] = useState(false);
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

  return (
    <div className="relative">
      <Button variant="secondary" onPress={() => setOpen(!open)} aria-expanded={open}>
        Notifications{unread > 0 ? ` (${unread} unread)` : ""}
      </Button>
      {open && (
        <section
          aria-label="Notifications"
          className="absolute right-0 z-10 mt-stack-sm flex w-screen max-w-sm flex-col gap-stack-sm rounded-card border border-default bg-card p-inset-md shadow-card"
        >
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
                      setOpen(false);
                    }}
                  >
                    Open the listing
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
