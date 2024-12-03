import { ArrowUp, ArrowDown } from "lucide-react";

const ChangeIndicator = ({
    isIncreased,
    percentageChange,
}: {
    isIncreased: boolean | null;
    percentageChange: string;
}) => {
    const getIndicatorStyles = () => {
        if (isIncreased === true) return "bg-green-100";
        if (isIncreased === false) return "bg-red-100";
        return "bg-gray-200";
    };

    const renderArrow = () => {
        if (isIncreased === true)
            return <ArrowUp size={16} strokeWidth={0.75} />;
        if (isIncreased === false)
            return <ArrowDown size={16} strokeWidth={0.75} />;
        return "-";
    };

    return (
        <span
            className={`rounded py-1 px-2 ${getIndicatorStyles()} flex items-center gap-2 w-fit`}
        >
            {renderArrow()}
            <p className="font-semibold text-sm">{percentageChange}</p>
        </span>
    );
};

export default ChangeIndicator;
