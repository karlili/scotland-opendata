import { Link, createFileRoute } from "@tanstack/react-router";
import { SearchBox } from "~/components/SearchBox";
import { Card } from "~/components/ui";
import { listCouncils, listSources, searchDatasets } from "~/lib/hub";

export const Route = createFileRoute("/")({
  loader: async () => {
    const [sources, councils, apiDatasets, allDatasets] = await Promise.all([
      listSources(),
      listCouncils({ data: {} }),
      searchDatasets({ data: { limit: 1 } }),
      searchDatasets({ data: { has_api: "any", limit: 1 } }),
    ]);
    return { sources, councils, apiTotal: apiDatasets.total, allTotal: allDatasets.total };
  },
  component: Home,
});

function Home() {
  const { sources, councils, apiTotal, allTotal } = Route.useLoaderData();
  const national = sources.filter((s) => !s.council_id);
  const councilPortals = sources.filter((s) => s.council_id);
  const resources = sources.reduce((n, s) => n + s.resource_count, 0);
  const neverSynced = sources.every((s) => !s.last_synced_at);

  return (
    <div className="space-y-10">
      <section className="rounded-xl bg-white px-6 py-10 shadow-sm ring-1 ring-slate-200 sm:px-10">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Scotland's open data, in one place</h1>
        <p className="mt-3 max-w-2xl text-lg text-slate-600">
          Search datasets from the Scottish Government, statistics.gov.scot, Spatial Hub and council portals, and preview
          the data straight from the publisher's API.
        </p>
        <div className="mt-6 max-w-2xl">
          <SearchBox size="lg" />
        </div>
        <dl className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Datasets with an API" value={apiTotal} to="/datasets" />
          <Stat label="Datasets in total" value={allTotal} to="/datasets" search={{ has_api: "any" }} />
          <Stat label="Endpoints and downloads" value={resources} />
          <Stat label="Sources" value={sources.length} to="/sources" />
        </dl>
      </section>

      {neverSynced && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          The hub hasn't harvested any sources yet. Run <code>pnpm sync</code> in the hub, then reload.
        </div>
      )}

      <section>
        <SectionTitle title="National portals" to="/sources" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {national.map((s) => (
            <Card key={s.id} className="p-5">
              <h3 className="font-medium text-slate-900">
                <Link to="/datasets" search={{ source: s.id, has_api: "any" }}>
                  {s.title}
                </Link>
              </h3>
              <p className="mt-1 text-sm text-slate-500">{s.publisher}</p>
              <p className="mt-3 text-sm text-slate-700">
                {s.dataset_count.toLocaleString()} datasets · {s.resource_count.toLocaleString()} resources
              </p>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle title="Councils" to="/councils" />
        <Card className="p-5">
          <p className="text-slate-700">
            All {councils.length} councils are in the register.{" "}
            {councils.filter((c) => c.provision === "portal").length} run their own open data portal, and the hub
            harvests {councilPortals.length} of them. Every council also publishes spatial data on Spatial Hub.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {councils
              .filter((c) => c.dataset_count > 0)
              .sort((a, b) => b.dataset_count - a.dataset_count)
              .slice(0, 12)
              .map((c) => (
                <Link
                  key={c.id}
                  to="/councils/$id"
                  params={{ id: c.id }}
                  className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700 hover:bg-brand-50 hover:no-underline"
                >
                  {c.name} <span className="text-slate-400">{c.dataset_count}</span>
                </Link>
              ))}
          </div>
        </Card>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  to,
  search,
}: {
  label: string;
  value: number;
  to?: "/datasets" | "/sources";
  search?: { has_api: "any" };
}) {
  const number = <span className="text-2xl font-semibold text-slate-900">{value.toLocaleString()}</span>;
  return (
    <div className="rounded-lg bg-slate-50 p-4">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="mt-1">
        {to ? (
          <Link to={to} search={search} className="hover:no-underline">
            {number}
          </Link>
        ) : (
          number
        )}
      </dd>
    </div>
  );
}

function SectionTitle({ title, to }: { title: string; to: "/sources" | "/councils" }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <Link to={to} className="text-sm">
        See all
      </Link>
    </div>
  );
}
