// The top of every page (T327): an optional link back up, the page's one h1 with an optional status
// beside it, a line of context under it, and the page's main actions on the right.
import Link from "next/link";
import type { ReactNode } from "react";

export type PageHeaderProps = {
  title: string;
  /** The page one level up, shown above the title. */
  back?: { href: string; label: string };
  /** A status chip beside the title. */
  status?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
};

export function PageHeader({ title, back, status, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-stack-md">
      <div className="flex flex-col gap-stack-sm">
        {back && (
          <Link href={back.href} className="text-body text-link hover:text-link-hover">
            {back.label}
          </Link>
        )}
        <div className="flex flex-wrap items-center gap-inline-md">
          <h1 className="font-heading text-heading-lg text-heading">{title}</h1>
          {status}
        </div>
        {description && <p className="text-body-lg text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-inline-md">{actions}</div>}
    </div>
  );
}
