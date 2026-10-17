import type { ReactNode } from "react";
import type { Rows } from "~/lib/hub";
import { CellValue } from "./ui";

/** Columns the upstream adds for bookkeeping rather than data. */
const hidden = (id: string) => id === "_id" || id === "_full_text";

/**
 * A table of upstream rows. SPARQL rows carry `<field>_uri` next to a labelled
 * field; the label is shown and links to the URI.
 */
export function RowsTable({
  rows,
  header,
}: {
  rows: Rows;
  /** Optional custom header cell, e.g. a sort control. */
  header?: (field: { id: string; type: string }) => ReactNode;
}) {
  const fields = rows.fields.filter((f) => !hidden(f.id));
  if (rows.records.length === 0) {
    return <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">No rows.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {fields.map((f) => (
              <th key={f.id} scope="col" className={`whitespace-nowrap px-3 py-2 font-medium ${numeric(f.type) ? "text-right" : ""}`}>
                {header ? header(f) : f.id}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.records.map((r, i) => (
            <tr key={String(r._id ?? i)} className="hover:bg-slate-50">
              {fields.map((f) => {
                const uri = r[`${f.id}_uri`];
                return (
                  <td key={f.id} className={`max-w-md px-3 py-2 align-top ${numeric(f.type) ? "text-right" : ""}`}>
                    {typeof uri === "string" && r[f.id] !== uri ? (
                      <a href={uri} target="_blank" rel="noreferrer">
                        {String(r[f.id])}
                      </a>
                    ) : (
                      <CellValue value={r[f.id]} />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const numeric = (type: string) => /^(int|integer|numeric|float|double|decimal|number|bigint)/i.test(type);
