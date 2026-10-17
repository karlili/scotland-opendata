import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

/** A search form that also works before hydration (plain GET to /datasets). */
export function SearchBox({ initial = "", size = "md" }: { initial?: string; size?: "md" | "lg" }) {
  const navigate = useNavigate();
  const [q, setQ] = useState(initial);
  useEffect(() => setQ(initial), [initial]);
  const big = size === "lg";
  return (
    <form
      action="/datasets"
      method="get"
      role="search"
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        navigate({ to: "/datasets", search: (prev) => ({ ...prev, q: q.trim() || undefined, offset: undefined }) });
      }}
    >
      <label htmlFor="q" className="sr-only">
        Search datasets
      </label>
      <input
        id="q"
        name="q"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search datasets, e.g. population, bus stops, schools"
        className={`min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 text-slate-900 shadow-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 ${big ? "py-3 text-base" : "py-2 text-sm"}`}
      />
      <button
        type="submit"
        className={`rounded-md bg-brand-600 font-medium text-white hover:bg-brand-700 ${big ? "px-5 text-base" : "px-4 text-sm"}`}
      >
        Search
      </button>
    </form>
  );
}
