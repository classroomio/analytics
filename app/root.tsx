import styles from "./globals.css?url";
import {
    json,
    LoaderFunctionArgs,
    type LinksFunction,
} from "@remix-run/cloudflare";

import {
    Links,
    Meta,
    Outlet,
    Scripts,
    ScrollRestoration,
    useLoaderData,
} from "@remix-run/react";

export const links: LinksFunction = () => [{ rel: "stylesheet", href: styles }];

export const loader = ({ context, request }: LoaderFunctionArgs) => {
    const url = new URL(request.url);
    return json({
        version: context.cloudflare?.env?.CF_PAGES_COMMIT_SHA,
        origin: url.origin,
        url: request.url,
    });
};

export const Layout = ({ children = [] }: { children: React.ReactNode }) => {
    const data = useLoaderData<typeof loader>() ?? {
        version: "unknown",
        origin: "counterscale.dev",
        url: "https://counterscale.dev/",
    };

    return (
        <html lang="en">
            <head>
                <meta charSet="utf-8" />
                <meta
                    name="viewport"
                    content="width=device-width, initial-scale=1"
                />
                <link rel="icon" type="image/x-icon" href="/favicon.png" />

                <meta property="og:url" content={data.url} />
                <meta property="og:type" content="website" />
                <meta property="og:title" content="Counterscale" />
                <meta
                    property="og:description"
                    content="Scalable web analytics you run yourself on Cloudflare"
                />
                <meta
                    property="og:image"
                    content={data.origin + "/counterscale-og-large.webp"}
                />

                <meta name="twitter:card" content="summary_large_image" />
                <meta property="twitter:domain" content="counterscale.dev" />
                <meta property="twitter:url" content={data.url} />
                <meta name="twitter:title" content="Counterscale" />
                <meta
                    name="twitter:description"
                    content="Scalable web analytics you run yourself on Cloudflare"
                />
                <meta
                    name="twitter:image"
                    content={data.origin + "/counterscale-og-large.webp"}
                />
                <Meta />
                <Links />
            </head>
            <body>
                <div className="container mx-auto">{children}</div>
                <ScrollRestoration />
                <Scripts />
                <script
                    dangerouslySetInnerHTML={{
                        __html: "window.counterscale = {'q': [['set', 'siteId', 'counterscale-dev'], ['trackPageview']] };",
                    }}
                ></script>
                <script id="counterscale-script" src="/tracker.js"></script>
            </body>
        </html>
    );
};

export default function App() {
    // const data = useLoaderData<typeof loader>();

    return (
        <div className="md:p-4">
            <header>
                <h1 className="dark:text-white text-2xl md:text-3xl font-bold">
                    Analytics
                </h1>
            </header>
            <main role="main" className="w-full">
                <Outlet />
            </main>
        </div>
    );
}
