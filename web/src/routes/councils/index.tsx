import { Link, createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Card, PageHeader, ProvisionBadge, provisionText } from "~/components/ui";
import { listCouncils, type Provision } from "~/lib/hub";

const provisions = ["portal", "landing-page", "none"] as const satisfies Provision[];

export const Route = createFileRoute("/councils/")({
  validateSearch: z.object({ provision: z.enum(provisions).optional().catch(undefined) }),
  loader: () => listCouncils({ data: {} }),
  head: () => ({ meta: [{ title: "Councils · Scotland Open Data" }] }),
  component: Councils,
});

function Councils() {
  const all = Route.useLoaderData();
  const { provision } = Route.useSearch();
  const councils = provision ? all.filter((c) => c.provision === provision) : all;
  const count = (p: Provision) => all.filter((c) => c.provision === p).length;

  return (
    <div>
      <PageHeader title="Councils">
        Where each of Scotland's {all.length} councils publishes open data. Every council also publishes standardised
        spatial data on Spatial Hub Scotland.
      </PageHeader>

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <Filter active={!provision} label={`All (${all.length})`} />
        {provisions.map((p) => (
          <Filter key={p} provision={p} active={provision === p} label={`${provisionText(p)} (${count(p)})`} />
        ))}
      </div>

      <Card className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Council</th>
              <th className="px-4 py-2 font-medium">Open data</th>
              <th className="px-4 py-2 font-medium">Platform</th>
              <th className="px-4 py-2 text-right font-medium">Datasets in hub</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {councils.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3">
                  <Link to="/councils/$id" params={{ id: c.id }} className="font-medium">
                    {c.name}
                  </Link>
                  <div className="text-xs text-slate-500">{c.gss}</div>
                </td>
                <td className="px-4 py-3">
                  <ProvisionBadge provision={c.provision} />
                </td>
                <td className="px-4 py-3 text-slate-600">{c.platform ?? "–"}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {c.dataset_count > 0 ? c.dataset_count.toLocaleString() : <span className="text-slate-400">0</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Filter({ provision, active, label }: { provision?: Provision; active: boolean; label: string }) {
  return (
    <Link
      to="/councils"
      search={{ provision }}
      className={`rounded-full px-3 py-1 hover:no-underline ${active ? "bg-brand-600 text-white hover:text-white" : "bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"}`}
    >
      {label}
    </Link>
  );
}
