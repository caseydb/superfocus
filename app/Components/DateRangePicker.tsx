"use client";

import React, { useState, useEffect, useRef } from "react";
import { useAppSelector, useAppDispatch } from "../store/hooks";
import { setPreference, updatePreferences } from "../store/preferenceSlice";

interface DateRange {
  start: Date | null;
  end: Date | null;
}

interface DateRangePickerProps {
  value?: DateRange;
  onChange?: (range: DateRange) => void;
  firstTaskDate?: Date | null;
}

const TIME_RANGES = [
  { label: "Today", value: "today" },
  { label: "This Week", value: "this_week" },
  { label: "This Month", value: "this_month" },
  { label: "Last 7 days", value: "7_days" },
  { label: "Last 14 days", value: "14_days" },
  { label: "Last 30 days", value: "30_days" },
  { label: "Last 90 days", value: "90_days" },
  { label: "Last 365 days", value: "365_days" },
  { label: "All Time", value: "all_time" },
  { label: "Custom", value: "custom" },
];

type DateRangeValue = "today" | "this_week" | "this_month" | "7_days" | "14_days" | "30_days" | "90_days" | "365_days" | "all_time" | "custom";

export default function DateRangePicker({ value, onChange, firstTaskDate }: DateRangePickerProps) {
  const dispatch = useAppDispatch();
  const savedDatePicker = useAppSelector((state) => state.preferences.analytics_date_pick);
  const userId = useAppSelector((state) => state.user.user_id);
  
  // Initialize with saved preference or default
  const [selectedRange, setSelectedRange] = useState<DateRangeValue>(
    savedDatePicker && savedDatePicker !== "custom" ? savedDatePicker as DateRangeValue : "all_time"
  );
  const [mounted, setMounted] = useState(false);
  const [adjustmentMessage, setAdjustmentMessage] = useState<string | null>(null);
  const hasInitialized = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Initialize from saved preference - only run once
  useEffect(() => {
    // Only initialize if we don't already have a value passed from parent
    if (mounted && savedDatePicker && savedDatePicker !== "custom" && !hasInitialized.current) {
      // If parent has already provided a value with actual dates, don't override it
      if (value && value.start && value.end) {
        hasInitialized.current = true;
        return;
      }
      
      hasInitialized.current = true;
      // Apply the saved range - reuse the internal function logic
      handleRangeChangeInternal(savedDatePicker as DateRangeValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, savedDatePicker]);

  // Only render the actual picker on client
  if (!mounted) {
    return (
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-md mx-auto">
        <div className="w-full sm:w-auto flex-shrink-0 relative">
          <div className="border border-gray-700 rounded-lg px-3 pr-8 py-2 bg-gray-900 h-9 w-32"></div>
        </div>
        <div className="flex items-center border border-gray-700 rounded-lg px-3 py-2 bg-gray-900 w-full sm:w-auto h-9"></div>
      </div>
    );
  }

  // Client-side only date helpers
  const getDateNDaysAgo = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n + 1);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const getTodayDate = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const getThisWeekStart = () => {
    const d = new Date();
    const day = d.getDay();
    const diff = day === 0 ? 6 : day - 1; // If Sunday (0), go back 6 days, otherwise go back (day - 1) days
    d.setDate(d.getDate() - diff);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const getThisMonthStart = () => {
    const d = new Date();
    d.setDate(1); // Set to first day of the month
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const formatDateForInput = (date: Date | null): string => {
    if (!date) return "";
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Get current date range values
  const getCurrentDateRange = (): DateRange => {
    if (value && value.start && value.end) {
      return value;
    }
    // Default to all time
    return {
      start: firstTaskDate || new Date("2020-01-01"),
      end: getTodayDate(),
    };
  };

  const currentRange = getCurrentDateRange();

  // Internal function to handle range changes
  const handleRangeChangeInternal = (val: DateRangeValue) => {
    let newRange: DateRange = { start: null, end: null };

    if (val === "custom") {
      // Keep current range
      newRange = getCurrentDateRange();
      setAdjustmentMessage(null);
    } else if (val === "today") {
      const today = getTodayDate();
      newRange = { start: today, end: today };
      setAdjustmentMessage(null);
    } else if (val === "this_week") {
      const weekStart = getThisWeekStart();
      if (firstTaskDate && firstTaskDate > weekStart) {
        const formattedDate = firstTaskDate.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
        setAdjustmentMessage(`Calculated from your first task on ${formattedDate}`);
        newRange = {
          start: firstTaskDate,
          end: getTodayDate(),
        };
      } else {
        setAdjustmentMessage(null);
        newRange = {
          start: weekStart,
          end: getTodayDate(),
        };
      }
    } else if (val === "this_month") {
      const monthStart = getThisMonthStart();
      if (firstTaskDate && firstTaskDate > monthStart) {
        const formattedDate = firstTaskDate.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
        setAdjustmentMessage(`Calculated from your first task on ${formattedDate}`);
        newRange = {
          start: firstTaskDate,
          end: getTodayDate(),
        };
      } else {
        setAdjustmentMessage(null);
        newRange = {
          start: monthStart,
          end: getTodayDate(),
        };
      }
    } else if (val === "all_time") {
      setAdjustmentMessage(null);
      newRange = {
        start: firstTaskDate || new Date("2020-01-01"),
        end: getTodayDate(),
      };
    } else {
      // Handle numbered day ranges
      const daysMatch = val.match(/^(\d+)_days$/);
      if (daysMatch) {
        const days = Number(daysMatch[1]);
        const startDate = getDateNDaysAgo(days);
        if (firstTaskDate && firstTaskDate > startDate) {
          const formattedDate = firstTaskDate.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
          setAdjustmentMessage(`Calculated from your first task on ${formattedDate}`);
          newRange = {
            start: firstTaskDate,
            end: getTodayDate(),
          };
        } else {
          setAdjustmentMessage(null);
          newRange = {
            start: startDate,
            end: getTodayDate(),
          };
        }
      }
    }

    onChange?.(newRange);
  };

  // When dropdown changes
  const handleRangeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value as DateRangeValue;
    setSelectedRange(val);
    
    // Apply the range
    handleRangeChangeInternal(val);
    
    // Save to preferences (except for custom)
    if (val !== "custom" && userId) {
      // Optimistic update
      dispatch(setPreference({ key: "analytics_date_pick", value: val }));
      
      // Database update
      dispatch(updatePreferences({ 
        userId, 
        updates: { analytics_date_pick: val } 
      }));
    }
  };

  // When user manually changes date
  const handleDateChange = (which: "start" | "end", value: string) => {
    if (!value) return;

    const [year, month, day] = value.split("-").map(Number);
    const newDate = new Date(year, month - 1, day, 0, 0, 0, 0);

    const newRange = {
      ...currentRange,
      [which]: newDate,
    };

    setSelectedRange("custom");
    onChange?.(newRange);
  };

  return (
    <div className="flex flex-col items-center justify-center gap-2 w-full">
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-md mx-auto">
        {/* Time Range Dropdown */}
        <div className="w-full sm:w-auto flex-shrink-0 relative">
        <select
          className="border border-gray-700 rounded-lg px-3 pr-8 py-2 bg-gray-900 text-gray-100 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#FFAA00] focus:border-[#FFAA00] appearance-none w-full cursor-pointer hover:border-gray-600 transition-all duration-200 hover:bg-gray-800"
          value={selectedRange}
          onChange={handleRangeChange}
        >
          {TIME_RANGES.map((r) => (
            <option key={r.value} value={r.value} className="bg-gray-900 text-gray-100 cursor-pointer">
              {r.label}
            </option>
          ))}
        </select>
        {/* Custom Chevron Icon */}
        <svg
          className="pointer-events-none absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Date Picker */}
      <div className="flex items-center border border-gray-700 rounded-lg px-3 py-2 bg-gray-900 w-full sm:w-auto hover:border-gray-600 transition-all duration-200 hover:bg-gray-800 group focus-within:ring-2 focus-within:ring-[#FFAA00] focus-within:border-[#FFAA00] focus-within:shadow-[0_0_0_4px_rgba(255,170,0,0.1)]">
        <input
          type="date"
          className="outline-none text-gray-100 text-xs bg-transparent cursor-pointer [color-scheme:dark] focus:text-[#FFAA00] font-mono w-[115px]"
          value={formatDateForInput(currentRange.start)}
          onChange={(e) => handleDateChange("start", e.target.value)}
          max={formatDateForInput(currentRange.end || getTodayDate())}
        />
        <span className="mx-2 text-gray-500 text-xs font-medium select-none">to</span>
        <input
          type="date"
          className="outline-none text-gray-100 text-xs bg-transparent cursor-pointer [color-scheme:dark] focus:text-[#FFAA00] font-mono w-[115px]"
          value={formatDateForInput(currentRange.end)}
          onChange={(e) => handleDateChange("end", e.target.value)}
          min={formatDateForInput(currentRange.start || new Date("2020-01-01"))}
          max={formatDateForInput(getTodayDate())}
        />
      </div>
    </div>
      {/* Adjustment message */}
      {adjustmentMessage && (
        <div className="text-xs text-gray-400 text-center italic">
          {adjustmentMessage}
        </div>
      )}
    </div>
  );
}
