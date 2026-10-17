/// <reference types="vite/client" />
import { HeadContent, Link, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ErrorView, NotFoundView } from "~/components/ui";
import { getConfig } from "~/lib/hub";
import css from "~/styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Scotland Open Data" },
      { name: "description", content: "Browse open data from the Scottish Government and Scotland's councils." },
    ],
    links: [{ rel: "stylesheet", href: css }],
  }),
  loader: () => getConfig(),
  staleTime: Infinity,
  component: RootComponent,
  errorComponent: (props) => (
    <RootDocument>
      <ErrorView {...props} />
    </RootDocument>
  ),
  notFoundComponent: () => <NotFoundView />,
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

const nav = [
  { to: "/datasets", label: "Datasets" },
  { to: "/sources", label: "Sources" },
  { to: "/councils", label: "Councils" },
] as const;

function RootDocument({ children }: { children: ReactNode }) {
  const config = Route.useLoaderData();
  return (
    <html lang="en-GB">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-slate-50 font-sans text-slate-800 antialiased">
        <header className="bg-brand-900 text-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-2 px-4 py-3">
            <Link to="/" className="text-lg font-semibold text-white hover:text-white hover:no-underline">
              Scotland Open Data
            </Link>
            <nav className="flex flex-wrap gap-1 text-sm">
              {nav.map((n) => (
                <Link
                  key={n.to}
                  to={n.to}
                  className="rounded px-3 py-1.5 text-brand-100 hover:bg-white/10 hover:text-white hover:no-underline"
                  activeProps={{ className: "bg-white/15 text-white" }}
                >
                  {n.label}
                </Link>
              ))}
              {config && (
                <a
                  href={`${config.publicHubUrl}/docs`}
                  className="rounded px-3 py-1.5 text-brand-100 hover:bg-white/10 hover:text-white hover:no-underline"
                >
                  API
                </a>
              )}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 pb-10 text-xs text-slate-500">
          Data from data.gov.scot, statistics.gov.scot, Spatial Hub Scotland and council portals, mostly under the Open
          Government Licence. Rows are fetched live from the publisher.
        </footer>
        <Scripts />
      </body>
    </html>
  );
}
