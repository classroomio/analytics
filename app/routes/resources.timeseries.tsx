import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import {
    getFiltersFromSearchParams,
    paramsFromUrl,
    getIntervalType,
    getDateTimeRange,
} from "~/lib/utils";
import { useEffect } from "react";
import { useFetcher } from "@remix-run/react";
import { Card, CardContent } from "~/components/ui/card";
import TimeSeriesChart from "~/components/TimeSeriesChart";
import { SearchFilters } from "~/lib/types";

export async function loader({ context, request }: LoaderFunctionArgs) {
    const { analyticsEngine } = context;
    const { interval, site } = paramsFromUrl(request.url);
    const url = new URL(request.url);
    const tz = url.searchParams.get("timezone") || "UTC";
    const filters = getFiltersFromSearchParams(url.searchParams);

    const intervalType = getIntervalType(interval);
    const { startDate, endDate } = getDateTimeRange(interval, tz);

    const viewsGroupedByInterval =
        await analyticsEngine.getViewsGroupedByInterval(
            site,
            intervalType,
            startDate,
            endDate,
            tz,
            filters,
        );

    const chartData: { date: string; views: number }[] = [];
    viewsGroupedByInterval.forEach((row) => {
        chartData.push({
            date: row[0],
            views: row[1],
        });
    });

    return json({
        chartData: chartData,
        intervalType: intervalType,
    });
}

export const TimeSeriesCard = ({
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
    const { chartData, intervalType } = dataFetcher.data || {};

    useEffect(() => {
        const params = {
            site: siteId,
            interval,
            timezone,
            ...filters,
        };

        dataFetcher.submit(params, {
            method: "get",
            action: `/resources/timeseries`,
        });
        // NOTE: dataFetcher is intentionally omitted from the useEffect dependency array
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [siteId, interval, filters, timezone]);

    return (
        <Card>
            <CardContent>
                <div className="h-72 pt-6 -m-4 -ml-8 sm:m-0">
                    {chartData && (
                        <TimeSeriesChart
                            data={chartData}
                            intervalType={intervalType}
                            timezone={timezone}
                        />
                    )}
                </div>
            </CardContent>
        </Card>
    );
};