import { Link, useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { AccessType, Provision } from "~/lib/hub";

export function PageHeader({ title, eyebrow, children }: { title: ReactNode; eyebrow?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-6">
      {eyebrow && <div className="mb-1 text-sm text-slate-500">{eyebrow}</div>}
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
      {children && <div className="mt-2 max-w-3xl text-slate-600">{children}</div>}
    </header>
  );
}

const tone = {
  green: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
  blue: "bg-brand-50 text-brand-700 ring-brand-600/20",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/20",
  slate: "bg-slate-100 text-slate-700 ring-slate-500/20",
  red: "bg-red-50 text-red-700 ring-red-600/20",
};

export function Badge({ children, color = "slate", title }: { children: ReactNode; color?: keyof typeof tone; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tone[color]}`}>
      {children}
    </span>
  );
}

const accessLabel: Record<AccessType, { label: string; color: keyof typeof tone; title: string }> = {
  api: { label: "API", color: "green", title: "Live endpoint" },
  csv: { label: "CSV", color: "amber", title: "CSV download only" },
  file: { label: "File", color: "slate", title: "Other download" },
};

export function AccessBadge({ access }: { access: AccessType }) {
  const a = accessLabel[access];
  return (
    <Badge color={a.color} title={a.title}>
      {a.label}
    </Badge>
  );
}

const provisionLabel: Record<Provision, { label: string; color: keyof typeof tone }> = {
  portal: { label: "Portal", color: "green" },
  "landing-page": { label: "Landing page", color: "amber" },
  none: { label: "Nothing on council site", color: "slate" },
};

export function ProvisionBadge({ provision }: { provision: Provision }) {
  const p = provisionLabel[provision];
  return <Badge color={p.color}>{p.label}</Badge>;
}

export const provisionText = (p: Provision) => provisionLabel[p].label;

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-slate-200 bg-white ${className}`}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-slate-600">
      {children}
    </div>
  );
}

export function Pager({
  total,
  limit,
  offset,
  shown,
  onPage,
}: {
  /** null when the upstream does not report a total. */
  total: number | null;
  limit: number;
  offset: number;
  shown: number;
  onPage: (offset: number) => ReactNode;
}) {
  const hasNext = total === null ? shown === limit : offset + limit < total;
  const hasPrev = offset > 0;
  if (!hasNext && !hasPrev) return null;
  const from = shown === 0 ? 0 : offset + 1;
  const to = offset + shown;
  return (
    <nav className="mt-4 flex items-center justify-between gap-4 text-sm text-slate-600">
      <span>
        {from.toLocaleString()}–{to.toLocaleString()}
        {total !== null && <> of {total.toLocaleString()}</>}
      </span>
      <span className="flex gap-2">
        {hasPrev ? onPage(Math.max(0, offset - limit)) : <DisabledButton>Previous</DisabledButton>}
        {hasNext ? onPage(offset + limit) : <DisabledButton>Next</DisabledButton>}
      </span>
    </nav>
  );
}

function DisabledButton({ children }: { children: ReactNode }) {
  return <span className="rounded-md border border-slate-200 px-3 py-1.5 text-slate-300">{children}</span>;
}

export const pagerButton = "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-50 hover:no-underline";

export function ErrorView({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-6">
      <h2 className="font-semibold text-red-800">Something went wrong</h2>
      <p className="mt-1 text-red-700">{error instanceof Error ? error.message : String(error)}</p>
      <button
        type="button"
        className="mt-4 rounded-md bg-white px-3 py-1.5 text-sm text-red-800 ring-1 ring-red-300 hover:bg-red-100"
        onClick={() => {
          reset();
          router.invalidate();
        }}
      >
        Try again
      </button>
    </div>
  );
}

export function NotFoundView({ what = "page" }: { what?: string }) {
  return (
    <Empty>
      <p className="font-medium text-slate-800">We couldn't find that {what}.</p>
      <p className="mt-2">
        <Link to="/datasets">Search the catalogue</Link>
      </p>
    </Empty>
  );
}

export function formatDate(value: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Renders a cell value from an upstream row: links for URLs, grouping for numbers. */
export function CellValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "") return <span className="text-slate-300">–</span>;
  if (typeof value === "number") return <span className="tabular-nums">{value.toLocaleString("en-GB")}</span>;
  if (typeof value === "boolean") return <>{value ? "true" : "false"}</>;
  if (typeof value === "object") return <code className="text-xs">{JSON.stringify(value)}</code>;
  const s = String(value);
  if (/^https?:\/\//.test(s)) {
    return (
      <a href={s} target="_blank" rel="noreferrer" className="break-all">
        {s}
      </a>
    );
  }
  return <>{s}</>;
}
