import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { SearchBox } from "~/components/SearchBox";
import { Badge, Card, Empty, PageHeader, Pager, formatDate, pagerButton } from "~/components/ui";
import { listSources, searchDatasets } from "~/lib/hub";

const PAGE = 20;

const search = z.object({
  q: z.string().optional().catch(undefined),
  source: z.string().optional().catch(undefined),
  has_api: z.enum(["true", "false", "any"]).optional().catch(undefined),
  offset: z.number().int().min(0).optional().catch(undefined),
});

export const Route = createFileRoute("/datasets/")({
  validateSearch: search,
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const [page, sources] = await Promise.all([
      searchDatasets({ data: { ...deps, limit: PAGE } }),
      listSources(),
    ]);
    return { page, sources };
  },
  head: ({ match }) => ({
    meta: [{ title: match.search.q ? `“${match.search.q}” · Datasets · Scotland Open Data` : "Datasets · Scotland Open Data" }],
  }),
  component: Datasets,
});

const accessOptions = [
  { value: undefined, label: "With an API" },
  { value: "any", label: "All, including CSV-only" },
  { value: "false", label: "Downloads only" },
] as const;

function Datasets() {
  const { page, sources } = Route.useLoaderData();
  const s = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const sourceTitle = new Map(sources.map((x) => [x.id, x.title]));
  const withDatasets = sources.filter((x) => x.dataset_count > 0).sort((a, b) => a.title.localeCompare(b.title));

  return (
    <div>
      <PageHeader title="Datasets">
        {s.q ? (
          <>
            {page.total.toLocaleString()} results for “{s.q}”
          </>
        ) : (
          <>{page.total.toLocaleString()} datasets</>
        )}
        {s.source && <> from {sourceTitle.get(s.source) ?? s.source}</>}
      </PageHeader>

      <div className="grid gap-8 lg:grid-cols-[16rem_1fr]">
        <aside className="space-y-6 text-sm">
          <div>
            <h2 className="mb-2 font-medium text-slate-900">Access</h2>
            <div className="space-y-1">
              {accessOptions.map((o) => (
                <label key={o.label} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="has_api"
                    checked={s.has_api === o.value || (o.value === undefined && s.has_api === "true")}
                    onChange={() => navigate({ search: (prev) => ({ ...prev, has_api: o.value, offset: undefined }) })}
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="source" className="mb-2 block font-medium text-slate-900">
              Source
            </label>
            <select
              id="source"
              value={s.source ?? ""}
              onChange={(e) =>
                navigate({ search: (prev) => ({ ...prev, source: e.target.value || undefined, offset: undefined }) })
              }
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5"
            >
              <option value="">All sources</option>
              {withDatasets.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.title} ({x.dataset_count})
                </option>
              ))}
            </select>
          </div>
          {(s.q || s.source || s.has_api) && (
            <Link to="/datasets" search={{}}>
              Clear filters
            </Link>
          )}
        </aside>

        <div>
          <SearchBox initial={s.q ?? ""} />
          <div className="mt-4 space-y-3">
            {page.items.length === 0 ? (
              <Empty>
                No datasets match.
                {s.has_api !== "any" && (
                  <>
                    {" "}
                    <Link from={Route.fullPath} search={(prev) => ({ ...prev, has_api: "any", offset: undefined })}>
                      Include CSV-only datasets
                    </Link>
                    .
                  </>
                )}
              </Empty>
            ) : (
              page.items.map((d) => (
                <Card key={d.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="font-medium">
                      <Link to="/datasets/$id" params={{ id: d.id }}>
                        {d.title}
                      </Link>
                    </h3>
                    <div className="flex gap-1">
                      {d.has_api && <Badge color="green">API</Badge>}
                      {d.has_csv && <Badge color="amber">CSV</Badge>}
                    </div>
                  </div>
                  {d.description && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{d.description}</p>}
                  <p className="mt-2 text-xs text-slate-500">
                    {[
                      d.publisher,
                      sourceTitle.get(d.source_id) ?? d.source_id,
                      d.modified && `Updated ${formatDate(d.modified)}`,
                      `${d.resource_count} ${d.resource_count === 1 ? "resource" : "resources"}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </Card>
              ))
            )}
          </div>
          <Pager
            total={page.total}
            limit={PAGE}
            offset={s.offset ?? 0}
            shown={page.items.length}
            onPage={(offset) => (
              <Link
                from={Route.fullPath}
                search={(prev) => ({ ...prev, offset: offset || undefined })}
                className={pagerButton}
              >
                {offset < (s.offset ?? 0) ? "Previous" : "Next"}
              </Link>
            )}
          />
        </div>
      </div>
    </div>
  );
}
