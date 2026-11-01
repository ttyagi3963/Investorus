// The card surface every screen section sits on (T327): white, 16px radius, the card shadow, and
// 24px padding (32px for a page's main form). With a title, it is a labelled region whose heading
// level the caller sets, so the page keeps a correct heading outline.
import { useId, type ReactNode } from "react";

export type CardProps = {
  title?: string;
  /** The heading level for the title, from the card's place in the page outline. */
  titleLevel?: 2 | 3;
  /** A short line under the title. */
  description?: ReactNode;
  /** Controls shown on the title's row, such as a filter or a link. */
  actions?: ReactNode;
  padding?: "lg" | "xl";
  children: ReactNode;
};

export function Card({
  title,
  titleLevel = 2,
  description,
  actions,
  padding = "lg",
  children,
}: CardProps) {
  const headingId = useId();
  const Heading = titleLevel === 2 ? "h2" : "h3";
  return (
    <section
      aria-labelledby={title ? headingId : undefined}
      className={`flex flex-col gap-stack-md rounded-card bg-card shadow-card ${padding === "xl" ? "p-inset-xl" : "p-inset-lg"}`}
    >
      {title && (
        <div className="flex flex-wrap items-start justify-between gap-inline-md">
          <div className="flex flex-col gap-stack-xs">
            <Heading id={headingId} className="font-heading text-heading-sm text-heading">
              {title}
            </Heading>
            {description && <p className="text-body text-muted">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}
