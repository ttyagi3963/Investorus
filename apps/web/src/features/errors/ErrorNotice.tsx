// An error message with its request ID (T300, T329), announced to screen readers as an alert, on the
// design's error tint. Every screen shows failures through this, so the ID is always there to quote
// to support.
import type { ReactNode } from "react";
import type { ErrorInfo } from "@/lib/errors";

export function ErrorNotice({ error, children }: { error: ErrorInfo; children?: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-stack-xs rounded-control border border-danger bg-status-error p-inset-md text-body text-status-error"
    >
      <p className="font-medium">{error.message}</p>
      {children}
      {error.requestId && (
        <p className="text-helper">
          Request ID: <code>{error.requestId}</code>
        </p>
      )}
    </div>
  );
}
