import { Link, createFileRoute } from "@tanstack/react-router";
import { Badge, Card, PageHeader, formatDate } from "~/components/ui";
import { listCouncils, listSources, type Source } from "~/lib/hub";

export const Route = createFileRoute("/sources")({
  loader: async () => {
    const [sources, councils] = await Promise.all([listSources(), listCouncils({ data: {} })]);
    return { sources, councilName: Object.fromEntries(councils.map((c) => [c.id, c.name])) };
  },
  head: () => ({ meta: [{ title: "Sources · Scotland Open Data" }] }),
  component: Sources,
});

const kindLabel: Record<Source["kind"], string> = {
  ckan: "CKAN",
  sparql: "SPARQL",
  dcat: "DCAT-AP feed",
  arcgis: "ArcGIS Hub",
};

function Sources() {
  const { sources, councilName } = Route.useLoaderData();
  const national = sources.filter((s) => !s.council_id);
  const councils = sources.filter((s) => s.council_id);
  return (
    <div className="space-y-10">
      <PageHeader title="Sources">
        The portals the hub harvests. Catalogue entries are copied into the hub; rows are fetched live from each
        portal's API when you view the data.
      </PageHeader>
      <SourceTable title="National portals" sources={national} councilName={councilName} />
      {councils.length > 0 && <SourceTable title="Council portals" sources={councils} councilName={councilName} />}
    </div>
  );
}

function SourceTable({
  title,
  sources,
  councilName,
}: {
  title: string;
  sources: Source[];
  councilName: Record<string, string>;
}) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-slate-900">{title}</h2>
      <Card className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Portal</th>
              <th className="px-4 py-2 font-medium">API</th>
              <th className="px-4 py-2 text-right font-medium">Datasets</th>
              <th className="px-4 py-2 text-right font-medium">Resources</th>
              <th className="px-4 py-2 font-medium">Last harvest</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sources.map((s) => (
              <tr key={s.id} className="align-top">
                <td className="px-4 py-3">
                  <div className="font-medium">
                    {s.dataset_count > 0 ? (
                      <Link to="/datasets" search={{ source: s.id, has_api: "any" }}>
                        {s.title}
                      </Link>
                    ) : (
                      s.title
                    )}
                  </div>
                  <div className="text-xs text-slate-500">
                    {s.council_id ? (
                      <Link to="/councils/$id" params={{ id: s.council_id }}>
                        {councilName[s.council_id] ?? s.publisher}
                      </Link>
                    ) : (
                      s.publisher
                    )}
                    {" · "}
                    <a href={s.homepage} target="_blank" rel="noreferrer">
                      {new URL(s.homepage).host}
                    </a>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge>{kindLabel[s.kind]}</Badge>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{s.dataset_count.toLocaleString()}</td>
                <td className="px-4 py-3 text-right tabular-nums">{s.resource_count.toLocaleString()}</td>
                <td className="px-4 py-3">
                  {s.last_sync_error ? (
                    <Badge color="red" title={s.last_sync_error}>
                      Failed
                    </Badge>
                  ) : s.last_synced_at ? (
                    formatDate(s.last_synced_at)
                  ) : (
                    <span className="text-slate-400">Never</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </section>
  );
}
