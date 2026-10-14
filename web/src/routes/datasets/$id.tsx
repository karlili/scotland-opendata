import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { RowsTable } from "~/components/RowsTable";
import { AccessBadge, Badge, Card, NotFoundView, PageHeader, formatDate } from "~/components/ui";
import { getDataset, getSource, queryRows } from "~/lib/hub";

const PREVIEW_ROWS = 10;

export const Route = createFileRoute("/datasets/$id")({
  loader: async ({ params }) => {
    const dataset = await getDataset({ data: { id: params.id } });
    if (!dataset) throw notFound();
    const firstQueryable = dataset.resources.find((r) => r.queryable);
    const [source, preview] = await Promise.all([
      getSource({ data: { id: dataset.source_id } }),
      firstQueryable ? queryRows({ data: { id: firstQueryable.id, limit: PREVIEW_ROWS } }) : null,
    ]);
    return { dataset, source, preview: firstQueryable && preview ? { resource: firstQueryable, result: preview } : null };
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData ? `${loaderData.dataset.title} · Scotland Open Data` : "Dataset · Scotland Open Data" }],
  }),
  notFoundComponent: () => <NotFoundView what="dataset" />,
  component: DatasetPage,
});

function DatasetPage() {
  const { dataset: d, source, preview } = Route.useLoaderData();
  const facts: [string, React.ReactNode][] = [
    ["Publisher", d.publisher],
    [
      "Source",
      source ? (
        <Link to="/datasets" search={{ source: source.id, has_api: "any" }}>
          {source.title}
        </Link>
      ) : (
        d.source_id
      ),
    ],
    ["Licence", d.license],
    ["Last updated", formatDate(d.modified)],
    ["Hub id", <code className="text-xs">{d.id}</code>],
    [
      "Metadata",
      <a href={d.upstream_url} target="_blank" rel="noreferrer" className="break-all">
        Upstream record
      </a>,
    ],
  ];

  return (
    <div>
      <PageHeader
        eyebrow={
          <>
            <Link to="/datasets">Datasets</Link>
            {source && (
              <>
                {" / "}
                <Link to="/datasets" search={{ source: source.id, has_api: "any" }}>
                  {source.title}
                </Link>
              </>
            )}
          </>
        }
        title={d.title}
      />

      <div className="grid gap-8 lg:grid-cols-[1fr_18rem]">
        <div className="min-w-0 space-y-8">
          {d.description && <p className="whitespace-pre-line text-slate-700">{d.description}</p>}

          <section>
            <h2 className="mb-3 text-lg font-semibold text-slate-900">Resources</h2>
            <Card className="divide-y divide-slate-100">
              {d.resources.length === 0 && <p className="p-4 text-slate-500">This dataset lists no resources.</p>}
              {d.resources.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-900">{r.name ?? r.upstream_id}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <AccessBadge access={r.access_type} />
                      {r.format && <Badge>{r.format}</Badge>}
                      {r.queryable && <Badge color="blue">Queryable</Badge>}
                    </div>
                  </div>
                  <div className="flex gap-3 text-sm">
                    {r.queryable && (
                      <Link to="/resources/$id" params={{ id: r.id }} className="font-medium">
                        View data
                      </Link>
                    )}
                    {r.url && (
                      <a href={r.url} target="_blank" rel="noreferrer">
                        {r.access_type === "api" ? "Open endpoint" : "Download"}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </Card>
          </section>

          {preview && (
            <section>
              <div className="mb-3 flex items-baseline justify-between gap-4">
                <h2 className="text-lg font-semibold text-slate-900">Preview: {preview.resource.name ?? "data"}</h2>
                <Link to="/resources/$id" params={{ id: preview.resource.id }} className="text-sm">
                  All rows
                </Link>
              </div>
              {preview.result.ok ? (
                <RowsTable rows={preview.result.rows} />
              ) : (
                <Card className="p-4 text-sm text-slate-600">
                  The publisher's API didn't answer: {preview.result.error}
                </Card>
              )}
            </section>
          )}
        </div>

        <aside className="space-y-6">
          <Card className="p-4">
            <dl className="space-y-3 text-sm">
              {facts
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-slate-500">{k}</dt>
                    <dd className="text-slate-900">{v}</dd>
                  </div>
                ))}
            </dl>
          </Card>
          {d.tags.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-medium text-slate-900">Tags</h2>
              <div className="flex flex-wrap gap-1.5">
                {d.tags.map((t) => (
                  <Link
                    key={t}
                    to="/datasets"
                    search={{ q: t, has_api: "any" }}
                    className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700 hover:bg-brand-50 hover:no-underline"
                  >
                    {t}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
