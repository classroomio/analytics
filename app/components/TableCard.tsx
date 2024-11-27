import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
} from "~/components/ui/table";

type CountByProperty = [string, string, string?][];

function calculateCountPercentages(countByProperty: CountByProperty) {
    const totalCount = countByProperty.reduce(
        (sum, row) => sum + parseInt(row[1]),
        0,
    );

    return countByProperty.map((row) => {
        const count = parseInt(row[1]);
        const percentage = ((count / totalCount) * 100).toFixed(2);
        return `${percentage}%`;
    });
}
export default function TableCard({
    countByProperty,
    columnHeaders,
    onClick,
}: {
    countByProperty: CountByProperty;
    columnHeaders: string[];
    onClick?: (key: string) => void;
}) {
    const barChartPercentages = calculateCountPercentages(countByProperty);
    const countFormatter = Intl.NumberFormat("en", { notation: "compact" });

    return (
        <Table className="w-full p-3">
            <TableRow className="flex items-center justify-between p-2 font-semibold">
                <TableHead className="font-semibold w-[70%] capitalize">
                    {columnHeaders[0]}
                </TableHead>
                <div className="flex items-center text-center w-[30%]">
                    {columnHeaders.slice(1).map((header) => (
                        <TableHead
                            key={header}
                            className="font-semibold w-full text capitalize"
                        >
                            {header}
                        </TableHead>
                    ))}
                </div>
            </TableRow>

            <TableBody>
                {(countByProperty || []).map((item, index) => {
                    const desc = item[0];
                    const [key, label] = Array.isArray(desc)
                        ? [desc[0], desc[1] || "(none)"]
                        : [desc, desc || "(none)"];

                    return (
                        <TableRow
                            key={item[0]}
                            className="relative flex items-center justify-between p-2 h-full"
                        >
                            <div
                                className="absolute left-0 top-0 h-full bg-blue-300/30 -z-10"
                                style={{ width: barChartPercentages[index] }}
                            />
                            <TableCell className="w-[80%] ">
                                {onClick ? (
                                    <button
                                        onClick={() => onClick(key as string)}
                                        className="hover:underline select-text text-left"
                                    >
                                        {label}
                                    </button>
                                ) : (
                                    label
                                )}
                            </TableCell>
                            <div className="flex items-center w-[30%] font-semibold">
                                <TableCell className="flex items-center justify-end gap-2 w-full">
                                    <div className="w-full text-center flex-1">
                                        <p className="text-sm w-full">
                                            {countFormatter.format(
                                                parseInt(item[1], 10),
                                            )}
                                        </p>
                                    </div>
                                </TableCell>
                                {item.length > 2 && item[2] !== undefined && (
                                    <TableCell className="flex items-center justify-end gap-2 w-full">
                                        <div className="w-full text-center flex-1">
                                            <p className="text-sm w-full">
                                                {countFormatter.format(
                                                    parseInt(item[2], 10),
                                                )}
                                            </p>
                                        </div>
                                    </TableCell>
                                )}
                            </div>
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
    );
}
