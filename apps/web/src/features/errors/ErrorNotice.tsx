// An error message with its request ID (T300), announced to screen readers as an alert. Every
// screen shows failures through this, so the ID is always there to quote to support.
import type { ReactNode } from "react";
import type { ErrorInfo } from "@/lib/errors";

export function ErrorNotice({ error, children }: { error: ErrorInfo; children?: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-stack-sm rounded-control border border-danger bg-danger-surface p-inset-md text-danger"
    >
      <p>{error.message}</p>
      {children}
      {error.requestId && (
        <p className="text-label">
          Request ID: <code>{error.requestId}</code>
        </p>
      )}
    </div>
  );
}
