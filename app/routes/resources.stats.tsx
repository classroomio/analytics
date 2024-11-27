import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getFiltersFromSearchParams, paramsFromUrl } from "~/lib/utils";
import { useEffect } from "react";
import { useFetcher } from "@remix-run/react";
import { SearchFilters } from "~/lib/types";
import ChangeIndicator from "~/components/ChangeIndicator";

export async function loader({ context, request }: LoaderFunctionArgs) {
    const { analyticsEngine } = context;
    const { interval, site } = paramsFromUrl(request.url);
    const url = new URL(request.url);
    const tz = url.searchParams.get("timezone") || "UTC";
    const filters = getFiltersFromSearchParams(url.searchParams);

    const counts = await analyticsEngine.getCounts(site, interval, tz, filters);

    // Calculate previous interval (e.g., if current is 7d, previous is 14d)
    const previousInterval = getPreviousInterval(interval);
    const previousCounts = await analyticsEngine.getCounts(
        site,
        previousInterval,
        tz,
        filters,
    );

    return json({
        views: counts.views,
        visits: counts.visits,
        visitors: counts.visitors,
        previousViews: previousCounts.views,
        previousVisits: previousCounts.visits,
        previousVisitors: previousCounts.visitors,
    });
}

// Helper function to get the previous interval
function getPreviousInterval(currentInterval: string): string {
    const intervalMap: { [key: string]: string } = {
        "1d": "2d",
        "7d": "14d",
        "30d": "60d",
        // Add more intervals as needed
    };
    return intervalMap[currentInterval] || currentInterval; // Default to current if not found
}

export const StatsCard = ({
    siteId,
    interval,
    filters,
    timezone,
}: {
    siteId: string;
    interval: string;
    filters: SearchFilters;
    timezone: string;
}) => {
    const dataFetcher = useFetcher<typeof loader>();

    const {
        views,
        visits,
        visitors,
        previousViews,
        previousVisits,
        previousVisitors,
    } = dataFetcher.data || {};
    const countFormatter = Intl.NumberFormat("en", { notation: "compact" });
    const calculatePercentageChange = (
        current: number,
        previous: number,
    ): { percentage: string; isIncreased: boolean | null } => {
        if (previous === 0) return { percentage: "N/A", isIncreased: null }; // Avoid division by zero
        const change = ((current - previous) / previous) * 100;
        return {
            percentage: change.toFixed(2) + "%",
            isIncreased: change > 0 ? true : change < 0 ? false : null, // null for no change
        };
    };

    // In your component, after fetching the data
    const { percentage: percentageChangeViews, isIncreased: isViewsIncreased } =
        calculatePercentageChange(views || 0, previousViews || 0);

    const {
        percentage: percentageChangeVisits,
        isIncreased: isVisitsIncreased,
    } = calculatePercentageChange(visits || 0, previousVisits || 0);

    const {
        percentage: percentageChangeVisitors,
        isIncreased: isVisitorsIncreased,
    } = calculatePercentageChange(visitors || 0, previousVisitors || 0);
    useEffect(() => {
        const params = {
            site: siteId,
            interval,
            timezone,
            ...filters,
        };

        dataFetcher.submit(params, {
            method: "get",
            action: `/resources/stats`,
        });
        // NOTE: dataFetcher is intentionally omitted from the useEffect dependency array
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [siteId, interval, filters, timezone]);

    return (
        <div className="flex items-center justify-around gap-4 sm:gap-10 w-full md:w-fit rounded-md p-2">
            <span className=" flex flex-col gap-2 items-center text-center capitalize">
                <p className="font-semibold text-sm text-gray-500">views</p>
                <div className="flex items-center gap-2">
                    <p className="font-semibold text-base md:text-xl">
                        {views ? countFormatter.format(views) : "-"}
                    </p>
                    <ChangeIndicator
                        isIncreased={isViewsIncreased}
                        percentageChange={percentageChangeViews}
                    />
                </div>
            </span>
            <span className=" flex flex-col gap-2 items-center text-center capitalize">
                <p className="font-semibold text-sm text-gray-500">visits</p>
                <div className="flex items-center gap-2">
                    <p className="font-semibold text-base md:text-xl">
                        {visits ? countFormatter.format(visits) : "-"}
                    </p>
                    <ChangeIndicator
                        isIncreased={isVisitsIncreased}
                        percentageChange={percentageChangeVisits}
                    />
                </div>
            </span>
            <span className=" flex flex-col gap-2 items-center text-center capitalize">
                <p className="font-semibold text-sm text-gray-500">visitors</p>
                <div className="flex items-center gap-2">
                    <p className="font-semibold text-base md:text-xl">
                        {visitors ? countFormatter.format(visitors) : "-"}
                    </p>
                    <ChangeIndicator
                        isIncreased={isVisitorsIncreased}
                        percentageChange={percentageChangeVisitors}
                    />
                </div>
            </span>
        </div>
    );
};
