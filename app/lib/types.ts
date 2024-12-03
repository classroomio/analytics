export interface SearchFilters {
    path?: string;
    referrer?: string;
    deviceModel?: string;
    country?: string;
    browserName?: string;
}

export interface EngagementMetrics {
    bounceRate: number; // as percentage (0-100)
    duration: number; // in seconds
}

export interface EngagementResult {
    current: EngagementMetrics;
    previous: EngagementMetrics;
}

export type MetricData = {
    views: number;
    visits: number;
    visitors: number;
    bounceRate: number;
    duration: number;
};

export type MetricChange = {
    value: string | number;
    percentage: string;
    isIncreased: boolean | null;
};
