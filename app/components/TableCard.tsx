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
        const percentage = ((count / totalCount) * 100).toFixed(0);
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
            <TableRow className="flex items-center p-2 font-semibold">
                <TableHead className="font-semibold w-[50%] capitalize ">
                    {columnHeaders[0]}
                </TableHead>
                <div className="flex items-center  min-w-[30%]">
                    {columnHeaders.slice(1).map((header) => (
                        <TableHead
                            key={header}
                            className="text-center  font-semibold capitalize w-full"
                        >
                            {header}
                        </TableHead>
                    ))}
                </div>
                <TableHead className="relative font-semibold w-[20%]" />
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
                            className="flex items-center justify-between p-2 h-full"
                        >
                            <TableCell className="w-[50%]">
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
                            <div className="flex items-center justify-center font-semibold min-w-[30%]  flex-1">
                                <TableCell className="flex items-center justify-center w-full flex-1">
                                    <div className="w-full text-center">
                                        <p className="text-sm w-full">
                                            {countFormatter.format(
                                                parseInt(item[1], 10),
                                            )}
                                        </p>
                                    </div>
                                </TableCell>
                                <>
                                    {item.length > 2 &&
                                        item[2] !== undefined && (
                                            <TableCell className="flex items-center justify-center w-full flex-1">
                                                <div className="w-full text-center">
                                                    <p className="text-sm w-full">
                                                        {countFormatter.format(
                                                            parseInt(
                                                                item[2],
                                                                10,
                                                            ),
                                                        )}
                                                    </p>
                                                </div>
                                            </TableCell>
                                        )}
                                </>
                            </div>
                            <TableCell className="border-l border-black w-[20%] relative">
                                <div
                                    className="absolute inset-0 bg-blue-300/30"
                                    style={{
                                        width: barChartPercentages[index],
                                    }}
                                />
                                <span className="relative z-10 text-sm text-center block">
                                    {barChartPercentages[index]}
                                </span>
                            </TableCell>
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
    );
}
