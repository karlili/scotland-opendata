import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { Badge, Card, NotFoundView, PageHeader, ProvisionBadge, formatDate } from "~/components/ui";
import { getCouncil, searchDatasets } from "~/lib/hub";

const PER_SOURCE = 10;

export const Route = createFileRoute("/councils/$id")({
  loader: async ({ params }) => {
    const council = await getCouncil({ data: { id: params.id } });
    if (!council) throw notFound();
    const pages = await Promise.all(
      council.source_ids.map(async (source) => ({
        source,
        page: await searchDatasets({ data: { source, has_api: "any", limit: PER_SOURCE } }),
      })),
    );
    return { council, pages };
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData ? `${loaderData.council.name} · Councils · Scotland Open Data` : "Council · Scotland Open Data" }],
  }),
  notFoundComponent: () => <NotFoundView what="council" />,
  component: CouncilPage,
});

function CouncilPage() {
  const { council: c, pages } = Route.useLoaderData();
  return (
    <div>
      <PageHeader eyebrow={<Link to="/councils">Councils</Link>} title={c.name}>
        <span className="flex flex-wrap items-center gap-2 text-sm">
          <ProvisionBadge provision={c.provision} />
          {c.platform && <Badge>{c.platform}</Badge>}
          <span className="text-slate-500">{c.gss}</span>
        </span>
      </PageHeader>

      <div className="grid gap-8 lg:grid-cols-[1fr_18rem]">
        <div className="min-w-0 space-y-8">
          {c.notes && <p className="text-slate-700">{c.notes}</p>}

          {pages.map(({ source, page }) => (
            <section key={source}>
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-lg font-semibold text-slate-900">Datasets from the council portal</h2>
                {page.total > PER_SOURCE && (
                  <Link to="/datasets" search={{ source, has_api: "any" }} className="text-sm">
                    All {page.total.toLocaleString()}
                  </Link>
                )}
              </div>
              <Card className="divide-y divide-slate-100">
                {page.items.length === 0 && (
                  <p className="p-4 text-sm text-slate-500">Nothing harvested yet. The portal may not have synced.</p>
                )}
                {page.items.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-3 p-3">
                    <Link to="/datasets/$id" params={{ id: d.id }}>
                      {d.title}
                    </Link>
                    <span className="flex gap-1">
                      {d.has_api && <Badge color="green">API</Badge>}
                      {d.has_csv && <Badge color="amber">CSV</Badge>}
                    </span>
                  </div>
                ))}
              </Card>
            </section>
          ))}

          {c.endpoints.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold text-slate-900">Other feeds</h2>
              <p className="mb-3 text-sm text-slate-600">The hub tracks these but doesn't harvest them.</p>
              <Card className="divide-y divide-slate-100">
                {c.endpoints.map((e) => (
                  <div key={e.url} className="flex items-center justify-between gap-3 p-3">
                    <a href={e.url} target="_blank" rel="noreferrer">
                      {e.title}
                    </a>
                    <Badge>{e.format}</Badge>
                  </div>
                ))}
              </Card>
            </section>
          )}

          <Card className="p-4 text-sm text-slate-700">
            {c.name} also publishes spatial data on Spatial Hub Scotland.{" "}
            <Link to="/datasets" search={{ source: "spatial-hub", q: c.name, has_api: "any" }}>
              Search Spatial Hub for {c.name}
            </Link>
          </Card>
        </div>

        <aside>
          <Card className="p-4">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-slate-500">Website</dt>
                <dd>
                  <a href={c.website} target="_blank" rel="noreferrer" className="break-all">
                    {new URL(c.website).host}
                  </a>
                </dd>
              </div>
              {c.open_data_url && (
                <div>
                  <dt className="text-slate-500">Open data</dt>
                  <dd>
                    <a href={c.open_data_url} target="_blank" rel="noreferrer" className="break-all">
                      {c.open_data_url.replace(/^https?:\/\//, "")}
                    </a>
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-slate-500">Datasets in the hub</dt>
                <dd className="text-slate-900">{c.dataset_count.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Register checked</dt>
                <dd className="text-slate-900">{formatDate(c.checked_at)}</dd>
              </div>
            </dl>
          </Card>
        </aside>
      </div>
    </div>
  );
}
