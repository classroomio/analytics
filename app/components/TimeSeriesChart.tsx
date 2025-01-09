import PropTypes, { InferProps } from "prop-types";

import {
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    BarChart,
    Legend,
    Bar,
} from "recharts";

export default function TimeSeriesChart({
    data,
    intervalType,
}: InferProps<typeof TimeSeriesChart.propTypes>) {
    // chart doesn't really work no data points, so just bail out
    if (data.length === 0) {
        return null;
    }

    // get the max integer value of data views

    console.log("chart data", data);

    function xAxisDateFormatter(date: string): string {
        const dateObj = new Date(date);

        // convert from utc to local time
        dateObj.setMinutes(dateObj.getMinutes() - dateObj.getTimezoneOffset());

        switch (intervalType) {
            case "DAY":
                return dateObj.toLocaleDateString("en-us", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                });
            case "HOUR":
                return dateObj.toLocaleTimeString("en-us", {
                    hour: "numeric",
                    minute: "numeric",
                });
            default:
                throw new Error("Invalid interval type");
        }
    }

    return (
        <ResponsiveContainer
            width="100%"
            height="100%"
            className="w-full min-w-full"
        >
            <BarChart
                width={500}
                height={400}
                data={data}
                margin={{
                    top: 10,
                    right: 30,
                    left: 0,
                    bottom: 0,
                }}
            >
                <CartesianGrid
                    strokeDasharray="1 0"
                    horizontal={true}
                    vertical={false}
                />
                <XAxis
                    dataKey="date"
                    tickFormatter={xAxisDateFormatter}
                    axisLine={true}
                    tickLine={false}
                />
                <YAxis
                    tickFormatter={(value) =>
                        new Intl.NumberFormat("en", {
                            notation: "compact",
                            maximumFractionDigits: 1,
                        }).format(value)
                    }
                />
                <Tooltip />
                <Legend />
                <Bar dataKey="views" stackId="a" fill="#2563EB" />
                <Bar dataKey="visits" stackId="a" fill="#3B82F6" />
                <Bar dataKey="visitors" stackId="a" fill="#60A5FA" />
            </BarChart>
        </ResponsiveContainer>
    );
}

TimeSeriesChart.propTypes = {
    data: PropTypes.arrayOf(
        PropTypes.shape({
            views: PropTypes.number.isRequired,
        }).isRequired,
    ).isRequired,
    intervalType: PropTypes.string,
    timezone: PropTypes.string,
};
