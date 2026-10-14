import { Link, createFileRoute, notFound, rootRouteId, useLoaderData, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { RowsTable } from "~/components/RowsTable";
import { AccessBadge, Badge, Card, NotFoundView, PageHeader, Pager, pagerButton } from "~/components/ui";
import { getDataset, getResource, getSource, queryRows, type Rows } from "~/lib/hub";

const PAGE_SIZES = [25, 50, 100, 250] as const;

const search = z.object({
  limit: z.number().int().min(1).max(1000).optional().catch(undefined),
  offset: z.number().int().min(0).optional().catch(undefined),
  q: z.string().optional().catch(undefined),
  sort: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/resources/$id")({
  validateSearch: search,
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    const resource = await getResource({ data: { id: params.id } });
    if (!resource) throw notFound();
    const [dataset, source, result] = await Promise.all([
      getDataset({ data: { id: resource.dataset_id } }),
      getSource({ data: { id: resource.source_id } }),
      resource.queryable ? queryRows({ data: { id: params.id, ...deps, limit: deps.limit ?? 50 } }) : null,
    ]);
    return { resource, dataset, source, result };
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData
          ? `${loaderData.resource.name ?? loaderData.resource.upstream_id} · ${loaderData.dataset?.title ?? "Data"} · Scotland Open Data`
          : "Data · Scotland Open Data",
      },
    ],
  }),
  notFoundComponent: () => <NotFoundView what="resource" />,
  component: ResourcePage,
});

function ResourcePage() {
  const { resource: r, dataset, source, result } = Route.useLoaderData();
  const s = Route.useSearch();
  const config = useLoaderData({ from: rootRouteId });
  const limit = s.limit ?? 50;
  const offset = s.offset ?? 0;
  // Search and sort are CKAN datastore features; SPARQL cubes page only.
  const ckan = source?.kind === "ckan";

  const rawQuery = new URLSearchParams();
  rawQuery.set("limit", String(limit));
  if (offset) rawQuery.set("offset", String(offset));
  if (s.q) rawQuery.set("q", s.q);
  if (s.sort) rawQuery.set("sort", s.sort);
  const rawUrl = `${config?.publicHubUrl ?? ""}/v1/resources/${encodeURIComponent(r.id)}/rows?${rawQuery}`;

  return (
    <div>
      <PageHeader
        eyebrow={
          <>
            <Link to="/datasets">Datasets</Link>
            {dataset && (
              <>
                {" / "}
                <Link to="/datasets/$id" params={{ id: dataset.id }}>
                  {dataset.title}
                </Link>
              </>
            )}
          </>
        }
        title={r.name ?? r.upstream_id}
      >
        <span className="flex flex-wrap items-center gap-2 text-sm">
          <AccessBadge access={r.access_type} />
          {r.format && <Badge>{r.format}</Badge>}
          {source && <span className="text-slate-500">from {source.title}</span>}
          {r.url && (
            <a href={r.url} target="_blank" rel="noreferrer">
              {r.access_type === "api" ? "Open endpoint" : "Download"}
            </a>
          )}
        </span>
      </PageHeader>

      {!result ? (
        <Card className="p-6 text-slate-700">
          The hub can't query this resource's rows.{" "}
          {r.url ? (
            <>
              You can{" "}
              <a href={r.url} target="_blank" rel="noreferrer">
                {r.access_type === "api" ? "open the endpoint" : "download it"}
              </a>{" "}
              from the publisher.
            </>
          ) : (
            "The publisher gives no download link."
          )}
        </Card>
      ) : (
        <>
          <Toolbar ckan={ckan} q={s.q} limit={limit} rows={result.ok ? result.rows : null} rawUrl={rawUrl} />
          {result.ok ? (
            <>
              <RowsTable
                rows={result.rows}
                header={ckan ? (f) => <SortHeader field={f.id} sort={s.sort} /> : undefined}
              />
              <Pager
                total={result.rows.total}
                limit={limit}
                offset={offset}
                shown={result.rows.records.length}
                onPage={(o) => (
                  <Link from={Route.fullPath} search={(prev) => ({ ...prev, offset: o || undefined })} className={pagerButton}>
                    {o < offset ? "Previous" : "Next"}
                  </Link>
                )}
              />
            </>
          ) : (
            <Card className="border-amber-200 bg-amber-50 p-6 text-amber-900">
              <p className="font-medium">The publisher's API didn't return rows.</p>
              <p className="mt-1 text-sm">{result.error}</p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Toolbar({
  ckan,
  q,
  limit,
  rows,
  rawUrl,
}: {
  ckan: boolean;
  q: string | undefined;
  limit: number;
  rows: Rows | null;
  rawUrl: string;
}) {
  const navigate = useNavigate({ from: Route.fullPath });
  const [text, setText] = useState(q ?? "");
  useEffect(() => setText(q ?? ""), [q]);
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
      {ckan && (
        <form
          className="flex min-w-64 flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            navigate({ search: (prev) => ({ ...prev, q: text.trim() || undefined, offset: undefined }) });
          }}
        >
          <input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search rows"
            aria-label="Search rows"
            className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
          />
          <button type="submit" className="rounded-md bg-brand-600 px-3 py-1.5 font-medium text-white hover:bg-brand-700">
            Search
          </button>
        </form>
      )}
      <label className="flex items-center gap-2 text-slate-600">
        Rows per page
        <select
          value={limit}
          onChange={(e) => navigate({ search: (prev) => ({ ...prev, limit: Number(e.target.value), offset: undefined }) })}
          className="rounded-md border border-slate-300 bg-white px-2 py-1"
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <span className="ml-auto flex gap-3">
        {rows && rows.records.length > 0 && (
          <button type="button" className="text-brand-600 hover:underline" onClick={() => downloadCsv(rows)}>
            Save page as CSV
          </button>
        )}
        <a href={rawUrl} target="_blank" rel="noreferrer">
          JSON from the hub API
        </a>
      </span>
    </div>
  );
}

function SortHeader({ field, sort }: { field: string; sort: string | undefined }) {
  const [col, dir] = (sort ?? "").split(" ");
  const active = col === field;
  const next = active && dir !== "desc" ? `${field} desc` : active ? undefined : field;
  return (
    <Link
      from={Route.fullPath}
      search={(prev) => ({ ...prev, sort: next, offset: undefined })}
      className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-900 hover:no-underline"
      title={`Sort by ${field}`}
    >
      {field}
      <span aria-hidden className={active ? "text-slate-900" : "text-slate-300"}>
        {active ? (dir === "desc" ? "↓" : "↑") : "↕"}
      </span>
    </Link>
  );
}

function downloadCsv(rows: Rows) {
  const cols = rows.fields.map((f) => f.id).filter((id) => id !== "_id");
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.map(cell).join(","), ...rows.records.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${rows.resource_id.replace(/[^\w.-]+/g, "_")}-${rows.offset}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
