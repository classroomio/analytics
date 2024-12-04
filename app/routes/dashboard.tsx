import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "~/components/ui/select";

import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import {
    isRouteErrorResponse,
    useLoaderData,
    useNavigation,
    useRouteError,
    useSearchParams,
} from "@remix-run/react";

import { ReferrerCard } from "./resources.referrer";
import { PathsCard } from "./resources.paths";
import { BrowserCard } from "./resources.browser";
import { CountryCard } from "./resources.country";
import { DeviceCard } from "./resources.device";

import {
    getFiltersFromSearchParams,
    getIntervalType,
    getUserTimezone,
} from "~/lib/utils";
import { SearchFilters } from "~/lib/types";
import SearchFilterBadges from "~/components/SearchFilterBadges";
import { TimeSeriesCard } from "./resources.timeseries";
import { StatsCard } from "./resources.stats";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const meta: MetaFunction = () => {
    return [
        { title: "ClassroomIO: Web Analytics" },
        {
            name: "description",
            content: "ClassromIO: Web Analytics powered by counterscale",
        },
    ];
};

const MAX_RETENTION_DAYS = 90;

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
    // NOTE: probably duped from getLoadContext / need to de-duplicate
    if (!context.cloudflare?.env?.CF_ACCOUNT_ID) {
        throw new Response("Missing credentials: CF_ACCOUNT_ID is not set.", {
            status: 501,
        });
    }
    if (!context.cloudflare?.env?.CF_BEARER_TOKEN) {
        throw new Response("Missing credentials: CF_BEARER_TOKEN is not set.", {
            status: 501,
        });
    }
    const { analyticsEngine } = context;

    const url = new URL(request.url);

    let interval;

    try {
        interval = url.searchParams.get("interval") || "7d";
    } catch (err) {
        interval = "7d";
    }

    // if no siteId is set, redirect to the site with the most hits
    // during the default interval (e.g. 7d)
    if (url.searchParams.has("site") === false) {
        const sitesByHits =
            await analyticsEngine.getSitesOrderedByHits(interval);

        // if at least one result
        const redirectSite = sitesByHits[0]?.[0] || "";
        const redirectUrl = new URL(request.url);
        redirectUrl.searchParams.set("site", redirectSite);
        return redirect(redirectUrl.toString());
    }

    const siteId = url.searchParams.get("site") || "";

    const actualSiteId = siteId === "@unknown" ? "" : siteId;

    const filters = getFiltersFromSearchParams(url.searchParams);

    // initiate requests to AE in parallel

    // sites by hits: This is to populate the "sites" dropdown. We query the full retention
    //                period (90 days) so that any site that has been active in the past 90 days
    //                will show up in the dropdown.

    const sitesByHits = analyticsEngine.getSitesOrderedByHits(
        `${MAX_RETENTION_DAYS}d`,
    );
    const intervalType = getIntervalType(interval);

    // await all requests to AE then return the results

    let out;
    try {
        out = {
            siteId: actualSiteId,
            sites: (await sitesByHits).map(
                ([site, _]: [string, number]) => site,
            ),
            intervalType,
            interval,
            filters,
        };
    } catch (err) {
        console.error(err);
        throw new Error("Failed to fetch data from Analytics Engine");
    }

    return json(out);
};

export default function Dashboard() {
    const [, setSearchParams] = useSearchParams();

    const data = useLoaderData<typeof loader>();
    const navigation = useNavigation();
    const loading = navigation.state === "loading";

    const intervalOrder = [
        {
            value: "today",
            title: "today",
        },
        {
            value: "yesterday",
            title: "yesterday",
        },
        {
            value: "1d",
            title: "24 hours",
        },
        {
            value: "7d",
            title: "7 days",
        },
        {
            value: "30d",
            title: "30 days",
        },
        {
            value: "90d",
            title: "90 days",
        },
    ];

    // Example usage in a dropdown component
    function changeInterval(interval: string) {
        setSearchParams((prev) => {
            prev.set("interval", interval);
            return prev;
        });
    }
    function switchInterval(direction: "prev" | "next") {
        const currentIndex = intervalOrder.findIndex(
            (order) => order.value === data.interval,
        );
        if (currentIndex === -1) return; // Invalid interval

        let newIndex;
        if (direction === "prev") {
            newIndex = currentIndex > 0 ? currentIndex - 1 : currentIndex;
        } else {
            newIndex =
                currentIndex < intervalOrder.length - 1
                    ? currentIndex + 1
                    : currentIndex;
        }

        changeInterval(intervalOrder[newIndex].value);
    }

    const handleFilterChange = (filters: SearchFilters) => {
        setSearchParams((prev) => {
            for (const key in filters) {
                if (Object.hasOwnProperty.call(filters, key)) {
                    prev.set(
                        key,
                        filters[key as keyof SearchFilters] as string,
                    );
                }
            }
            return prev;
        });
    };

    const handleFilterDelete = (key: string) => {
        setSearchParams((prev) => {
            prev.delete(key);
            return prev;
        });
    };

    const userTimezone = getUserTimezone();

    return (
        <div className="space-y-6">
            <div className="md:sticky dark:bg-black bg-white md:z-50 top-0 flex flex-col lg:flex-row lg:items-center justify-between gap-4 py-4">
                <div className="w-full mb-4">
                    <StatsCard
                        siteId={data.siteId}
                        interval={data.interval}
                        filters={data.filters}
                        timezone={userTimezone}
                    />
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-full max-w-[200px] min-w-[150px]">
                        <Select
                            value={data.interval}
                            onValueChange={(interval) =>
                                changeInterval(interval)
                            }
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {intervalOrder.map((interval, key) => {
                                    return (
                                        <SelectItem
                                            key={key}
                                            className="capitalize"
                                            value={interval.value}
                                        >
                                            {interval.title}
                                        </SelectItem>
                                    );
                                })}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex items-center justify-center divide-x">
                        <button
                            onClick={() => switchInterval("prev")}
                            className="bg-gray-100 text-black hover:bg-gray-300 flex items-center justify-center p-2"
                        >
                            <ChevronLeft strokeWidth={0.75} />
                        </button>
                        <button
                            onClick={() => switchInterval("next")}
                            className="bg-gray-100 text-black hover:bg-gray-300 flex items-center justify-center p-2"
                        >
                            <ChevronRight strokeWidth={0.75} />
                        </button>
                    </div>
                </div>
            </div>

            <div className="m-auto">
                <SearchFilterBadges
                    filters={data.filters}
                    onFilterDelete={handleFilterDelete}
                />
            </div>

            <div
                className="w-full transition py-4"
                style={{ opacity: loading ? 0.6 : 1 }}
            >
                <div className="w-full">
                    <TimeSeriesCard
                        siteId={data.siteId}
                        interval={data.interval}
                        filters={data.filters}
                        timezone={userTimezone}
                    />
                </div>
            </div>

            <div className="divide-y border">
                <div className="grid grid-cols-1 md:grid-cols-2 divide-x [&>*]:h-full">
                    <PathsCard
                        siteId={data.siteId}
                        interval={data.interval}
                        filters={data.filters}
                        onFilterChange={handleFilterChange}
                        timezone={userTimezone}
                    />
                    <ReferrerCard
                        siteId={data.siteId}
                        interval={data.interval}
                        filters={data.filters}
                        onFilterChange={handleFilterChange}
                        timezone={userTimezone}
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 divide-x ">
                    <BrowserCard
                        siteId={data.siteId}
                        interval={data.interval}
                        filters={data.filters}
                        onFilterChange={handleFilterChange}
                        timezone={userTimezone}
                    />

                    <CountryCard
                        siteId={data.siteId}
                        interval={data.interval}
                        filters={data.filters}
                        onFilterChange={handleFilterChange}
                        timezone={userTimezone}
                    />

                    <DeviceCard
                        siteId={data.siteId}
                        interval={data.interval}
                        filters={data.filters}
                        onFilterChange={handleFilterChange}
                        timezone={userTimezone}
                    />
                </div>
            </div>
        </div>
    );
}

export function ErrorBoundary() {
    const error = useRouteError();

    const errorTitle = isRouteErrorResponse(error) ? error.status : "Error";
    const errorBody = isRouteErrorResponse(error)
        ? error.data
        : error instanceof Error
          ? error.message
          : "Unknown error";

    return (
        <div className="border-2 rounded p-4 bg-card">
            <h1 className="text-2xl font-bold">{errorTitle}</h1>
            <p className="text-lg">{errorBody}</p>
        </div>
    );
}
