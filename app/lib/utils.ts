import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { MetricChange, MetricData } from "./types";

dayjs.extend(utc);
dayjs.extend(timezone);

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function paramsFromUrl(url: string) {
    const searchParams = new URL(url).searchParams;
    const params: Record<string, string> = {};
    searchParams.forEach((value, key) => {
        params[key] = value;
    });
    return params;
}

interface SearchFilters {
    path?: string;
    referrer?: string;
    deviceModel?: string;
    country?: string;
    browserName?: string;
}

export function getFiltersFromSearchParams(searchParams: URLSearchParams) {
    const filters: SearchFilters = {};

    if (searchParams.has("path")) {
        filters.path = searchParams.get("path") || "";
    }
    if (searchParams.has("referrer")) {
        filters.referrer = searchParams.get("referrer") || "";
    }
    if (searchParams.has("deviceModel")) {
        filters.deviceModel = searchParams.get("deviceModel") || "";
    }
    if (searchParams.has("country")) {
        filters.country = searchParams.get("country") || "";
    }
    if (searchParams.has("browserName")) {
        filters.browserName = searchParams.get("browserName") || "";
    }

    return filters;
}

export function getUserTimezone(): string {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch (e) {
        // Fallback to UTC if browser doesn't support Intl API
        return "UTC";
    }
}

export function getIntervalType(interval: string): "DAY" | "HOUR" {
    switch (interval) {
        case "today":
        case "yesterday":
        case "1d":
            return "HOUR";
        case "7d":
        case "30d":
        case "90d":
            return "DAY";
        default:
            return "DAY";
    }
}

export function getDateTimeRange(interval: string, tz: string) {
    let localDateTime = dayjs().utc();
    let localEndDateTime: dayjs.Dayjs | undefined;

    if (interval === "today") {
        localDateTime = localDateTime.tz(tz).startOf("day");
    } else if (interval === "yesterday") {
        localDateTime = localDateTime.tz(tz).startOf("day").subtract(1, "day");
        localEndDateTime = localDateTime.endOf("day").add(2, "ms");
    } else {
        const daysAgo = Number(interval.split("d")[0]);
        const intervalType = getIntervalType(interval);

        if (intervalType === "DAY") {
            localDateTime = localDateTime
                .subtract(daysAgo, "day")
                .tz(tz)
                .startOf("day");
        } else if (intervalType === "HOUR") {
            localDateTime = localDateTime
                .subtract(daysAgo, "day")
                .startOf("hour");
        }
    }

    if (!localEndDateTime) {
        localEndDateTime = dayjs().utc().tz(tz);
    }

    return {
        startDate: localDateTime.toDate(),
        endDate: localEndDateTime.toDate(),
    };
}

export function formatDuration(seconds: number): string {
    if (!seconds || seconds === 0) return "0s";

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    if (minutes === 0) return `${remainingSeconds}s`;
    return `${minutes}m${remainingSeconds}s`;
}

export function calculateMetricsChange(
    current: MetricData,
    previous: MetricData,
): Record<keyof MetricData, MetricChange> {
    const formatValue = (
        metric: keyof MetricData,
        value: number,
    ): string | number => {
        switch (metric) {
            case "bounceRate":
                return `${value.toFixed(1)}%`;
            case "duration":
                return formatDuration(value);
            default:
                return value;
        }
    };

    const calculateChange = (
        currentVal: number,
        previousVal: number,
    ): {
        percentage: string;
        isIncreased: boolean | null;
    } => {
        // Handle edge cases
        if (previousVal === 0) {
            return {
                percentage: "0%",
                isIncreased: null,
            };
        }

        const change = ((currentVal - previousVal) / previousVal) * 100;
        return {
            percentage: `${Math.abs(change).toFixed(0)}%`,
            isIncreased: change > 0 ? true : change < 0 ? false : null, // null for no change
        };
    };

    return Object.keys(current).reduce(
        (acc, metric) => {
            const key = metric as keyof MetricData;
            const currentValue = current[key];
            const previousValue = previous[key];
            const change = calculateChange(currentValue, previousValue);

            acc[key] = {
                value: formatValue(key, currentValue),
                percentage: change.percentage,
                isIncreased: change.isIncreased,
            };

            return acc;
        },
        {} as Record<keyof MetricData, MetricChange>,
    );
}
