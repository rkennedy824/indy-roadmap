"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Calendar, ChevronDown } from "lucide-react";
import {
  format,
  startOfQuarter,
  endOfQuarter,
  addQuarters,
  startOfYear,
  getQuarter,
  getYear,
} from "date-fns";

interface DateRangeSelectorProps {
  startDate: Date;
  endDate: Date;
  onRangeChange: (start: Date, end: Date) => void;
}

// Generate quarters for the current year and next year
function getQuarterOptions() {
  const today = new Date();
  const currentYear = getYear(today);
  const quarters: { label: string; start: Date; end: Date }[] = [];

  // Previous year Q4
  const prevYearQ4Start = startOfQuarter(new Date(currentYear - 1, 9, 1));
  quarters.push({
    label: `Q4 ${currentYear - 1}`,
    start: prevYearQ4Start,
    end: endOfQuarter(prevYearQ4Start),
  });

  // Current year quarters
  for (let q = 0; q < 4; q++) {
    const qStart = startOfQuarter(new Date(currentYear, q * 3, 1));
    quarters.push({
      label: `Q${q + 1} ${currentYear}`,
      start: qStart,
      end: endOfQuarter(qStart),
    });
  }

  // Next year quarters
  for (let q = 0; q < 4; q++) {
    const qStart = startOfQuarter(new Date(currentYear + 1, q * 3, 1));
    quarters.push({
      label: `Q${q + 1} ${currentYear + 1}`,
      start: qStart,
      end: endOfQuarter(qStart),
    });
  }

  return quarters;
}

// Check if the current range matches a quarter
function getMatchingQuarter(start: Date, end: Date) {
  const quarters = getQuarterOptions();
  for (const q of quarters) {
    if (
      format(q.start, "yyyy-MM-dd") === format(start, "yyyy-MM-dd") &&
      format(q.end, "yyyy-MM-dd") === format(end, "yyyy-MM-dd")
    ) {
      return q.label;
    }
  }
  return null;
}

export function DateRangeSelector({
  startDate,
  endDate,
  onRangeChange,
}: DateRangeSelectorProps) {
  const [open, setOpen] = useState(false);
  const [customStart, setCustomStart] = useState(format(startDate, "yyyy-MM-dd"));
  const [customEnd, setCustomEnd] = useState(format(endDate, "yyyy-MM-dd"));

  const quarters = getQuarterOptions();
  const matchingQuarter = getMatchingQuarter(startDate, endDate);

  const handleQuarterSelect = (q: { start: Date; end: Date }) => {
    onRangeChange(q.start, q.end);
    setOpen(false);
  };

  const handleCustomApply = () => {
    const start = new Date(customStart);
    const end = new Date(customEnd);
    if (start <= end) {
      onRangeChange(start, end);
      setOpen(false);
    }
  };

  const displayLabel = matchingQuarter
    ? matchingQuarter
    : `${format(startDate, "MMM d, yyyy")} - ${format(endDate, "MMM d, yyyy")}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Calendar className="h-4 w-4" />
          {displayLabel}
          <ChevronDown className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-4">
          <div>
            <h4 className="font-medium text-sm mb-2">Quick Select</h4>
            <div className="grid grid-cols-3 gap-2">
              {quarters.map((q) => (
                <Button
                  key={q.label}
                  variant={matchingQuarter === q.label ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleQuarterSelect(q)}
                >
                  {q.label}
                </Button>
              ))}
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="font-medium text-sm mb-2">Custom Range</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="start-date" className="text-xs">
                  Start Date
                </Label>
                <Input
                  id="start-date"
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="end-date" className="text-xs">
                  End Date
                </Label>
                <Input
                  id="end-date"
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                />
              </div>
            </div>
            <Button
              className="w-full mt-3"
              size="sm"
              onClick={handleCustomApply}
            >
              Apply Custom Range
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
