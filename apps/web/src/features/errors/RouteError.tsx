"use client";
// What an area's error page shows (T334). A 404 means the record is gone (deleted, or the demo data
// was reset since this tab loaded it), so the page says so and links back to the area's list instead
// of showing the copy the tab remembered. Anything else is unexpected: it says so, keeps the request
// ID, and offers Try again, which clears React Query's error state so the page's queries refetch.
import { buttonClasses, Button, Card } from "@clever/ui";
import { useQueryErrorResetBoundary } from "@tanstack/react-query";
import Link from "next/link";
import { ErrorNotice } from "@/features/errors/ErrorNotice";
import { PageHeader } from "@/features/shell/PageHeader";
import { describeError, isGone } from "@/lib/errors";

export type RouteErrorProps = {
  error: unknown;
  retry: () => void;
  /** The area's list page, where a user goes when the record is gone. */
  home: { href: string; label: string };
};

export function RouteError({ error, retry, home }: RouteErrorProps) {
  const { reset } = useQueryErrorResetBoundary();

  if (isGone(error)) {
    return (
      <>
        <PageHeader title="Not found" />
        <Card>
          <p className="text-body-lg text-default">
            This no longer exists. It may have been deleted, or the demo data was reset since you
            opened it.
          </p>
          <div>
            <Link href={home.href} className={buttonClasses()}>
              {home.label}
            </Link>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Something went wrong" />
      <ErrorNotice error={describeError(error, "This page could not be loaded.")} />
      <div>
        <Button
          onPress={() => {
            reset();
            retry();
          }}
        >
          Try again
        </Button>
      </div>
    </>
  );
}
