import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import {
    calculateMetricsChange,
    getFiltersFromSearchParams,
    paramsFromUrl,
} from "~/lib/utils";
import { useEffect } from "react";
import { useFetcher } from "@remix-run/react";
import { MetricChange, MetricData, SearchFilters } from "~/lib/types";
import ChangeIndicator from "~/components/ChangeIndicator";

export async function loader({ context, request }: LoaderFunctionArgs) {
    const { analyticsEngine } = context;
    const { interval, site } = paramsFromUrl(request.url);
    const url = new URL(request.url);
    const tz = url.searchParams.get("timezone") || "UTC";
    const filters = getFiltersFromSearchParams(url.searchParams);

    const counts = await analyticsEngine.getCounts(site, interval, tz, filters);

    const allMetrics = {
        current: {
            ...counts.current,
        },
        previous: {
            ...counts.previous,
        },
    };

    const changes = calculateMetricsChange(
        allMetrics.current,
        allMetrics.previous,
    );

    return json({ metrics: allMetrics, changes });
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

    const { metrics, changes } = dataFetcher.data || {};

    const formatValue = (value: number | undefined) => {
        if (value === undefined || value === null) return "-";

        return new Intl.NumberFormat("en", {
            notation: "compact",
        }).format(value);
    };

    const metricCards: Array<{
        label: keyof MetricData;
        formatter?: (value: number) => string;
    }> = [{ label: "views" }, { label: "visits" }, { label: "visitors" }];

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
        <div className="flex flex-wrap justify-start items-center lg:justify-around gap-10 w-full md:w-fit rounded-md py-2 lg:p-2">
            {metricCards.map(({ label }) => {
                const change = changes?.[label] as MetricChange;
                const currentValue =
                    metrics?.current[label as keyof MetricData];

                return (
                    <span
                        key={label}
                        className="flex flex-col gap-2 items-center text-center capitalize"
                    >
                        <p className="font-bold text-sm tracking-wide">
                            {label}
                        </p>
                        <p className="font-bold text-xl md:text-3xl">
                            {formatValue(currentValue)}
                        </p>
                        <div>
                            {change && (
                                <ChangeIndicator
                                    isIncreased={change.isIncreased}
                                    percentageChange={change.percentage}
                                />
                            )}
                        </div>
                    </span>
                );
            })}
        </div>
    );
};
