export interface SearchFilters {
    path?: string;
    referrer?: string;
    deviceModel?: string;
    country?: string;
    browserName?: string;
}

export type MetricData = {
    views: number;
    visits: number;
    visitors: number;
};

export type MetricChange = {
    value: string | number;
    percentage: string;
    isIncreased: boolean | null;
};
