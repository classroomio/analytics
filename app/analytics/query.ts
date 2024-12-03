import { ColumnMappingToType, ColumnMappings } from "./schema";

import { EngagementResult, SearchFilters } from "~/lib/types";

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);
interface AnalyticsQueryResult<
    SelectionSet extends Record<string, string | number>,
> {
    meta: string;
    data: SelectionSet[];
    rows: number;
    rows_before_limit_at_least: number;
}

interface AnalyticsCountResult {
    views: number;
    visits: number;
    visitors: number;
}

/** Given an AnalyticsCountResult object, and an object representing a row returned from
 *  CF Analytics Engine w/ counts grouped by isVisitor and isVisit, accumulate view,
 *  visit, and visitor counts.
 */
function accumulateCountsFromRowResult(
    counts: AnalyticsCountResult,
    row: {
        count: number;
        isVisitor: number;
        isVisit: number;
    },
) {
    if (row.isVisit == 1) {
        counts.visits += Number(row.count);
    }
    if (row.isVisitor == 1) {
        counts.visitors += Number(row.count);
    }
    counts.views += Number(row.count);
}

export function intervalToSql(interval: string, tz?: string) {
    let startIntervalSql = "";
    let endIntervalSql = "";
    switch (interval) {
        case "today":
            // example: toDateTime('2024-01-07 00:00:00', 'America/New_York')
            startIntervalSql = `toDateTime('${dayjs().tz(tz).startOf("day").utc().format("YYYY-MM-DD HH:mm:ss")}')`;
            endIntervalSql = "NOW()";
            break;
        case "yesterday":
            startIntervalSql = `toDateTime('${dayjs().tz(tz).startOf("day").utc().subtract(1, "day").format("YYYY-MM-DD HH:mm:ss")}')`;
            endIntervalSql = `toDateTime('${dayjs().tz(tz).startOf("day").utc().format("YYYY-MM-DD HH:mm:ss")}')`;
            break;
        case "1d":
        case "7d":
        case "30d":
        case "90d":
            startIntervalSql = `NOW() - INTERVAL '${interval.split("d")[0]}' DAY`;
            endIntervalSql = "NOW()";
            break;
        default:
            startIntervalSql = `NOW() - INTERVAL '1' DAY`;
            endIntervalSql = "NOW()";
    }
    return { startIntervalSql, endIntervalSql };
}

/**
 * returns an object with keys of the form "YYYY-MM-DD HH:00:00" and values of 0
 * example:
 *   {
 *      "2021-01-01 00:00:00": 0,
 *      "2021-01-01 02:00:00": 0,
 *      "2021-01-01 04:00:00": 0,
 *      ...
 *   }
 *
 * */

function getPreviousInterval(interval: string): string {
    switch (interval) {
        case "today":
            return "yesterday";
        case "yesterday":
            return "2d"; // This will work with existing intervalToSql
        case "7days":
            return "14d";
        case "30days":
            return "60d";
        case "90days":
            return "180d";
        default:
            return "1d";
    }
}

function generateEmptyRowsOverInterval(
    intervalType: "DAY" | "HOUR",
    startDateTime: Date,
    endDateTime: Date,
    tz?: string,
): { [key: string]: number } {
    if (!tz) {
        tz = "Etc/UTC";
    }

    const initialRows: { [key: string]: number } = {};

    while (startDateTime.getTime() < endDateTime.getTime()) {
        const key = dayjs(startDateTime).utc().format("YYYY-MM-DD HH:mm:ss");
        initialRows[key] = 0;

        if (intervalType === "DAY") {
            // WARNING: Daylight savings hack. Cloudflare Workers uses a different Date
            //          implementation than Node 20.x, which doesn't seem to respect DST
            //          boundaries the same way(see: https://github.com/benvinegar/counterscale/issues/108).
            //
            //          To work around this, we add 25 hours to the start date/time, then get the
            //          start of the day, then convert it back to a Date object. This works in both
            //          Node 20.x and Cloudflare Workers environments.
            startDateTime = dayjs(startDateTime)
                .add(25, "hours")
                .tz(tz)
                .startOf("day")
                .toDate();
        } else if (intervalType === "HOUR") {
            startDateTime = dayjs(startDateTime).add(1, "hour").toDate();
        } else {
            throw new Error("Invalid interval type");
        }
    }

    return initialRows;
}

function filtersToSql(filters: SearchFilters) {
    const supportedFilters: Array<keyof SearchFilters> = [
        "path",
        "referrer",
        "browserName",
        "country",
        "deviceModel",
    ];

    let filterStr = "";
    supportedFilters.forEach((filter) => {
        if (Object.hasOwnProperty.call(filters, filter)) {
            filterStr += `AND ${ColumnMappings[filter]} = '${filters[filter]}'`;
        }
    });
    return filterStr;
}

/**
 * NOTE: There are a bunch of "unsafe" SQL-like queries in here, in the sense that
 *       they are unparameterized raw SQL-like strings sent over HTTP. Cloudflare Analytics Engine
 *       does NOT support parameterized queries, nor is there an easy SQL-escaping
 *       library floating around for NodeJS (without using a database client library).
 *       Since Cloudflare Analytics Engine SQL API only supports SELECT, I think it's okay to
 *       leave it like this for now (i.e. an attacker cannot DROP TABLES or mutate data).
 *
 *       See: https://developers.cloudflare.com/analytics/analytics-engine/sql-reference/
 */

export class AnalyticsEngineAPI {
    cfApiToken: string;
    cfAccountId: string;
    defaultHeaders: {
        "content-type": string;
        "X-Source": string;
        Authorization: string;
    };
    defaultUrl: string;

    constructor(cfAccountId: string, cfApiToken: string) {
        this.cfAccountId = cfAccountId;
        this.cfApiToken = cfApiToken;

        this.defaultUrl = `https://api.cloudflare.com/client/v4/accounts/${this.cfAccountId}/analytics_engine/sql`;
        this.defaultHeaders = {
            "content-type": "application/json;charset=UTF-8",
            "X-Source": "Cloudflare-Workers",
            Authorization: `Bearer ${this.cfApiToken}`,
        };
    }

    async query(query: string) {
        const response = await fetch(this.defaultUrl, {
            method: "POST",
            body: query,
            headers: this.defaultHeaders,
        });

        // Add error logging
        if (!response.ok) {
            const text = await response.text(); // Get raw response text
            console.error("API Error Response:", {
                status: response.status,
                statusText: response.statusText,
                body: text,
            });
        }

        return response;
    }

    async getViewsGroupedByInterval(
        siteId: string,
        intervalType: "DAY" | "HOUR",
        startDateTime: Date,
        endDateTime: Date,
        tz?: string,
        filters: SearchFilters = {},
    ) {
        let intervalCount = 1;

        // keeping this code here once we start allowing bigger intervals (e.g. intervals of 2 hours)
        switch (intervalType) {
            case "DAY":
            case "HOUR":
                intervalCount = 1;
                break;
        }

        // note interval count hard-coded to hours at the moment
        const initialRows = generateEmptyRowsOverInterval(
            intervalType,
            startDateTime,
            endDateTime,
            tz,
        );

        const filterStr = filtersToSql(filters);

        // NOTE: when using toStartOfInterval, cannot group by other columns
        //       like double1 (isVisitor) or double2 (isSession/isVisit). This
        //       is just a limitation of Cloudflare Analytics Engine.
        //       -- but you can filter on them (using WHERE)

        // NOTE 2: Since CF AE doesn't support COALESCE, this query will not return
        //         rows (dates) where no hits were recorded -- which is why we need
        //         to generate empty buckets in JS (generateEmptyRowsOverInterval)
        //         and merge them with the results.

        const localStartTime = dayjs(startDateTime).tz(tz).utc();
        const localEndTime = dayjs(endDateTime).tz(tz).utc();

        // Simplified query that directly calculates views, visitors, and visits
        const query = `
            SELECT 
                toStartOfInterval(timestamp, INTERVAL '${intervalCount}' ${intervalType}, '${tz}') as _bucket,
                toDateTime(_bucket, 'Etc/UTC') as bucket,
                SUM(_sample_interval) as views,
                SUM(IF(${ColumnMappings.newVisitor} = 1, _sample_interval, 0)) as visitors,
                SUM(IF(${ColumnMappings.newSession} = 1, _sample_interval, 0)) as visits
            FROM metricsDataset
            WHERE timestamp >= toDateTime('${localStartTime.format("YYYY-MM-DD HH:mm:ss")}')
                AND timestamp < toDateTime('${localEndTime.format("YYYY-MM-DD HH:mm:ss")}')
                AND ${ColumnMappings.siteId} = '${siteId}'
                ${filterStr}
            GROUP BY _bucket
            ORDER BY _bucket ASC`;

        type SelectionSet = {
            bucket: string;
            views: number;
            visitors: number;
            visits: number;
        };

        const queryResult = this.query(query);
        const returnPromise = new Promise<[string, number, number, number][]>(
            (resolve, reject) =>
                (async () => {
                    const response = await queryResult;

                    if (!response.ok) {
                        reject(response.statusText);
                    }

                    const responseData =
                        (await response.json()) as AnalyticsQueryResult<SelectionSet>;

                    // Merge with initial rows and convert to array format
                    const rowsByDateTime = responseData.data.reduce(
                        (accum, row) => {
                            const utcDateTime = new Date(row.bucket);
                            const key = dayjs(utcDateTime).format(
                                "YYYY-MM-DD HH:mm:ss",
                            );
                            accum[key] = {
                                views: Number(row.views),
                                visitors: Number(row.visitors),
                                visits: Number(row.visits),
                            };
                            return accum;
                        },
                        Object.keys(initialRows).reduce(
                            (acc, key) => {
                                acc[key] = { views: 0, visitors: 0, visits: 0 };
                                return acc;
                            },
                            {} as Record<
                                string,
                                {
                                    views: number;
                                    visitors: number;
                                    visits: number;
                                }
                            >,
                        ),
                    );

                    // Convert to array format [datetime, views, visitors, visits]
                    const sortedRows = Object.entries(rowsByDateTime)
                        .sort((a, b) => a[0].localeCompare(b[0]))
                        .map(([date, counts]) => [
                            date,
                            counts.views,
                            counts.visitors,
                            counts.visits,
                        ]);

                    resolve(sortedRows as [string, number, number, number][]);
                })(),
        );
        return returnPromise;
    }

    async getCounts(
        siteId: string,
        interval: string,
        tz?: string,
        filters: SearchFilters = {},
    ) {
        // Get current period interval
        const { startIntervalSql, endIntervalSql } = intervalToSql(
            interval,
            tz,
        );
        const filterStr = filtersToSql(filters);

        // For previous period, adjust the interval
        const prevInterval = getPreviousInterval(interval);
        const { startIntervalSql: prevStartSql, endIntervalSql: prevEndSql } =
            intervalToSql(prevInterval, tz);

        const query = `
            SELECT 
                SUM(_sample_interval) as views,
                SUM(IF(${ColumnMappings.newVisitor} = 1, _sample_interval, 0)) as visitors,
                SUM(IF(${ColumnMappings.newSession} = 1, _sample_interval, 0)) as visits
            FROM metricsDataset
            WHERE timestamp >= ${startIntervalSql}
                AND timestamp < ${endIntervalSql}
                AND ${ColumnMappings.siteId} = '${siteId}'
                ${filterStr}`;

        const prevQuery = `
            SELECT 
                SUM(_sample_interval) as views,
                SUM(IF(${ColumnMappings.newVisitor} = 1, _sample_interval, 0)) as visitors,
                SUM(IF(${ColumnMappings.newSession} = 1, _sample_interval, 0)) as visits
            FROM metricsDataset
            WHERE timestamp >= ${prevStartSql}
                AND timestamp < ${prevEndSql}
                AND ${ColumnMappings.siteId} = '${siteId}'
                ${filterStr}`;

        try {
            const [currentResponse, previousResponse] = await Promise.all([
                this.query(query),
                this.query(prevQuery),
            ]);

            if (!currentResponse.ok || !previousResponse.ok) {
                throw new Error("Failed to fetch counts");
            }

            const currentData = await currentResponse.json();
            const previousData = await previousResponse.json();

            return {
                current: {
                    views: Number(
                        (currentData as { data: { views: number }[] }).data[0]
                            ?.views || 0,
                    ),
                    visitors: Number(
                        (currentData as { data: { visitors: number }[] })
                            .data[0]?.visitors || 0,
                    ),
                    visits: Number(
                        (currentData as { data: { visits: number }[] }).data[0]
                            ?.visits || 0,
                    ),
                },
                previous: {
                    views: Number(
                        (previousData as { data: { views: number }[] }).data[0]
                            ?.views || 0,
                    ),
                    visitors: Number(
                        (previousData as { data: { visitors: number }[] })
                            .data[0]?.visitors || 0,
                    ),
                    visits: Number(
                        (previousData as { data: { visits: number }[] }).data[0]
                            ?.visits || 0,
                    ),
                },
            };
        } catch (error) {
            console.error("Error fetching counts:", error);
            throw new Error("Failed to fetch counts");
        }
    }

    async getEngagementMetrics(
        siteId: string,
        interval: string,
        tz?: string,
        filters: SearchFilters = {},
    ) {
        const { startIntervalSql, endIntervalSql } = intervalToSql(
            interval,
            tz,
        );
        const prevInterval = getPreviousInterval(interval);
        const { startIntervalSql: prevStartSql, endIntervalSql: prevEndSql } =
            intervalToSql(prevInterval, tz);
        const filterStr = filtersToSql(filters);

        const query = `
            SELECT 
                SUM(IF(${ColumnMappings.newSession} = 1, _sample_interval, 0)) as total_visits,
                SUM(IF(${ColumnMappings.pageViews} = 1 AND ${ColumnMappings.newSession} = 1, _sample_interval, 0)) as bounce_visits,
                AVG(IF(${ColumnMappings.newSession} = 1, ${ColumnMappings.visitDuration}, 0.0)) as avg_duration
            FROM metricsDataset
            WHERE timestamp >= ${startIntervalSql}
                AND timestamp < ${endIntervalSql}
                AND ${ColumnMappings.siteId} = '${siteId}'
                ${filterStr}`;

        const prevQuery = `
            SELECT 
                SUM(IF(${ColumnMappings.newSession} = 1, _sample_interval, 0)) as total_visits,
                SUM(IF(${ColumnMappings.pageViews} = 1 AND ${ColumnMappings.newSession} = 1, _sample_interval, 0)) as bounce_visits,
                AVG(IF(${ColumnMappings.newSession} = 1, ${ColumnMappings.visitDuration}, 0.0)) as avg_duration
            FROM metricsDataset
            WHERE timestamp >= ${prevStartSql}
                AND timestamp < ${prevEndSql}
                AND ${ColumnMappings.siteId} = '${siteId}'
                ${filterStr}`;

        try {
            const [currentResponse, previousResponse] = await Promise.all([
                this.query(query),
                this.query(prevQuery),
            ]);

            if (!currentResponse.ok || !previousResponse.ok) {
                throw new Error("Failed to fetch engagement metrics");
            }

            const currentData = await currentResponse.json();
            const previousData = await previousResponse.json();

            const calculateBounceRate = (data: any | unknown) => {
                const total = Number(data.total_visits || 0);
                const bounces = Number(data.bounce_visits || 0);
                return total > 0 ? (bounces / total) * 100 : 0;
            };

            return {
                current: {
                    bounceRate: calculateBounceRate(
                        (currentData as EngagementResult["current"] | any)
                            ?.data[0],
                    ),
                    duration: Number(
                        (currentData as EngagementResult["current"] | any)
                            ?.data[0]?.avg_duration || 0,
                    ),
                },
                previous: {
                    bounceRate: calculateBounceRate(
                        (previousData as EngagementResult["previous"] | any)
                            ?.data[0],
                    ),
                    duration: Number(
                        (previousData as EngagementResult["previous"] | any)
                            ?.data[0]?.avg_duration || 0,
                    ),
                },
            };
        } catch (error) {
            console.error("Error fetching engagement metrics:", error);
            throw new Error("Failed to fetch engagement metrics");
        }
    }

    async getVisitorCountByColumn<T extends keyof typeof ColumnMappings>(
        siteId: string,
        column: T,
        interval: string,
        tz?: string,
        filters: SearchFilters = {},
        page: number = 1,
        limit: number = 10,
    ) {
        const { startIntervalSql, endIntervalSql } = intervalToSql(
            interval,
            tz,
        );

        const filterStr = filtersToSql(filters);

        const _column = ColumnMappings[column];
        const query = `
            SELECT ${_column}, SUM(_sample_interval) as count
            FROM metricsDataset
            WHERE timestamp >= ${startIntervalSql} AND timestamp < ${endIntervalSql}
                AND ${ColumnMappings.newVisitor} = 1
                AND ${ColumnMappings.siteId} = '${siteId}'
                ${filterStr}
            GROUP BY ${_column}
            ORDER BY count DESC
            LIMIT ${limit * page}`;

        type SelectionSet = {
            count: number;
        } & Record<
            (typeof ColumnMappings)[T],
            ColumnMappingToType<(typeof ColumnMappings)[T]>
        >;

        const queryResult = this.query(query);
        const returnPromise = new Promise<
            [ColumnMappingToType<typeof _column>, number][]
        >((resolve, reject) =>
            (async () => {
                const response = await queryResult;

                if (!response.ok) {
                    reject(response.statusText);
                }

                const responseData =
                    (await response.json()) as AnalyticsQueryResult<SelectionSet>;

                // since CF AE doesn't support OFFSET clauses, we select up to LIMIT and
                // then slice that into the individual requested page
                const pageData = responseData.data.slice(
                    limit * (page - 1),
                    limit * page,
                );

                resolve(
                    pageData.map((row) => {
                        const key = row[_column];
                        return [key, Number(row["count"])] as const;
                    }),
                );
            })(),
        );
        return returnPromise;
    }

    async getAllCountsByColumn<T extends keyof typeof ColumnMappings>(
        siteId: string,
        column: T,
        interval: string,
        tz?: string,
        filters: SearchFilters = {},
        page: number = 1,
        limit: number = 10,
    ): Promise<Record<string, AnalyticsCountResult>> {
        const { startIntervalSql, endIntervalSql } = intervalToSql(
            interval,
            tz,
        );

        const filterStr = filtersToSql(filters);

        const _column = ColumnMappings[column];
        const query = `
            SELECT ${_column},
                ${ColumnMappings.newVisitor} as isVisitor,
                ${ColumnMappings.newSession} as isVisit,
                SUM(_sample_interval) as count
            FROM metricsDataset
            WHERE timestamp >= ${startIntervalSql} AND timestamp < ${endIntervalSql}
                AND ${ColumnMappings.siteId} = '${siteId}'
                ${filterStr}
            GROUP BY ${_column}, ${ColumnMappings.newVisitor}, ${ColumnMappings.newSession}
            ORDER BY count DESC
            LIMIT ${limit * page}`;

        type SelectionSet = {
            readonly count: number;
            readonly isVisitor: number;
            readonly isVisit: number;
        } & Record<
            (typeof ColumnMappings)[T],
            ColumnMappingToType<(typeof ColumnMappings)[T]>
        >;

        const queryResult = this.query(query);
        const returnPromise = new Promise<Record<string, AnalyticsCountResult>>(
            (resolve, reject) =>
                (async () => {
                    const response = await queryResult;

                    if (!response.ok) {
                        reject(response.statusText);
                    }

                    const responseData =
                        (await response.json()) as AnalyticsQueryResult<SelectionSet>;

                    // since CF AE doesn't support OFFSET clauses, we select up to LIMIT and
                    // then slice that into the individual requested page
                    const pageData = responseData.data.slice(
                        limit * (page - 1),
                        limit * page,
                    );

                    const result = pageData.reduce(
                        (acc, row) => {
                            const key = row[_column] as string;
                            if (!Object.hasOwn(acc, key)) {
                                acc[key] = {
                                    views: 0,
                                    visitors: 0,
                                    visits: 0,
                                } as AnalyticsCountResult;
                            }

                            accumulateCountsFromRowResult(acc[key], row);
                            return acc;
                        },
                        {} as Record<string, AnalyticsCountResult>,
                    );
                    resolve(result);
                })(),
        );
        return returnPromise;
    }

    async getCountByPath(
        siteId: string,
        interval: string,
        tz?: string,
        filters: SearchFilters = {},
        page: number = 1,
    ): Promise<[path: string, visitors: number, views: number][]> {
        const allCountsResultPromise = this.getAllCountsByColumn(
            siteId,
            "path",
            interval,
            tz,
            filters,
            page,
        );

        return allCountsResultPromise.then((allCountsResult) => {
            const result: [string, number, number][] = [];
            for (const [key] of Object.entries(allCountsResult)) {
                const record = allCountsResult[key];
                result.push([key, record.visitors, record.views]);
            }
            // sort by visitors
            return result.sort((a, b) => b[1] - a[1]);
        });
    }

    async getCountByCountry(
        siteId: string,
        interval: string,
        tz?: string,
        filters: SearchFilters = {},
        page: number = 1,
    ): Promise<[country: string, visitors: number][]> {
        return this.getVisitorCountByColumn(
            siteId,
            "country",
            interval,
            tz,
            filters,
            page,
        );
    }

    async getCountByReferrer(
        siteId: string,
        interval: string,
        tz?: string,
        filters: SearchFilters = {},
        page: number = 1,
    ): Promise<[referrer: string, visitors: number, views: number][]> {
        const allCountsResultPromise = this.getAllCountsByColumn(
            siteId,
            "referrer",
            interval,
            tz,
            filters,
            page,
        );

        return allCountsResultPromise.then((allCountsResult) => {
            const result: [string, number, number][] = [];
            for (const [key] of Object.entries(allCountsResult)) {
                const record = allCountsResult[key];
                result.push([key, record.visitors, record.views]);
            }
            // sort by visitors
            return result.sort((a, b) => b[1] - a[1]);
        });
    }

    async getCountByBrowser(
        siteId: string,
        interval: string,
        tz?: string,
        filters: SearchFilters = {},
        page: number = 1,
    ): Promise<[browser: string, visitors: number][]> {
        return this.getVisitorCountByColumn(
            siteId,
            "browserName",
            interval,
            tz,
            filters,
            page,
        );
    }

    async getCountByDevice(
        siteId: string,
        interval: string,
        tz?: string,
        filters: SearchFilters = {},
        page: number = 1,
    ): Promise<[deviceModel: string, visitors: number][]> {
        return this.getVisitorCountByColumn(
            siteId,
            "deviceModel",
            interval,
            tz,
            filters,
            page,
        );
    }

    async getSitesOrderedByHits(interval: string, limit?: number) {
        // defaults to 1 day if not specified

        limit = limit || 10;

        const { startIntervalSql, endIntervalSql } = intervalToSql(interval);

        const query = `
            SELECT SUM(_sample_interval) as count,
                ${ColumnMappings.siteId} as siteId
            FROM metricsDataset
            WHERE timestamp >= ${startIntervalSql} AND timestamp < ${endIntervalSql}
            GROUP BY siteId
            ORDER BY count DESC
            LIMIT ${limit}
        `;

        type SelectionSet = {
            count: number;
            siteId: string;
        };

        const queryResult = this.query(query);
        const returnPromise = new Promise<[string, number][]>(
            (resolve, reject) =>
                (async () => {
                    const response = await queryResult;

                    if (!response.ok) {
                        reject(response.statusText);
                        return;
                    }

                    const responseData =
                        (await response.json()) as AnalyticsQueryResult<SelectionSet>;
                    const result = responseData.data.reduce(
                        (acc, cur) => {
                            acc.push([cur["siteId"], cur["count"]]);
                            return acc;
                        },
                        [] as [string, number][],
                    );

                    resolve(result);
                })(),
        );
        return returnPromise;
    }
}
