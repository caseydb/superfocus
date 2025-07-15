'use client'

import React, { useState, useEffect } from 'react'

interface DateRange {
  start: Date | null
  end: Date | null
}

interface DateRangePickerProps {
  value?: DateRange
  onChange?: (range: DateRange) => void
  firstTaskDate?: Date | null
}

const TIME_RANGES = [
  { label: "Today", value: "today" },
  { label: "Last 7 days", value: 7 },
  { label: "Last 14 days", value: 14 },
  { label: "Last 30 days", value: 30 },
  { label: "Last 90 days", value: 90 },
  { label: "Last 365 days", value: 365 },
  { label: "All Time", value: "all" },
  { label: "Custom", value: "custom" },
]

function getDateNDaysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n + 1)
  d.setHours(0, 0, 0, 0)
  return d
}

function getTodayDate() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function formatDateForInput(date: Date | null): string {
  if (!date) return ''
  try {
    // Ensure we have a valid date object
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    // Use local date components to avoid timezone issues
    const year = d.getFullYear();
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch {
    return ''
  }
}


export default function DateRangePicker({ value, onChange, firstTaskDate }: DateRangePickerProps) {
  const [selectedRange, setSelectedRange] = useState<number | "custom" | "today" | "all">("all")
  const [dateRange, setDateRange] = useState<DateRange>({
    start: null,
    end: null
  })
  const [mounted, setMounted] = useState(false)

  // Ensure component is mounted before rendering
  useEffect(() => {
    setMounted(true)
  }, [])

  // Initialize dates on client side only
  useEffect(() => {
    if (mounted && (!dateRange.start || !dateRange.end)) {
      const defaultStart = firstTaskDate || new Date('2020-01-01');
      defaultStart.setHours(0, 0, 0, 0);
      const defaultEnd = getTodayDate();
      
      setDateRange({
        start: value?.start || defaultStart,
        end: value?.end || defaultEnd
      })
    }
  }, [mounted, firstTaskDate, value, dateRange.start, dateRange.end])

  // Update parent when dateRange changes
  useEffect(() => {
    if (mounted && dateRange.start && dateRange.end) {
      onChange?.(dateRange)
    }
  }, [mounted, dateRange, onChange])

  // When dropdown changes, update dateRange
  function handleRangeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value
    if (value === "custom") {
      setSelectedRange("custom")
      // Don't change dateRange
    } else if (value === "today") {
      setSelectedRange("today")
      const today = getTodayDate()
      setDateRange({
        start: today,
        end: today,
      })
    } else if (value === "all") {
      setSelectedRange("all")
      // Use first task date or fallback to Jan 1, 2020
      const start = firstTaskDate ? new Date(firstTaskDate) : new Date('2020-01-01');
      start.setHours(0, 0, 0, 0);
      setDateRange({
        start: start,
        end: getTodayDate(),
      })
    } else {
      const days = Number(value)
      setSelectedRange(days)
      setDateRange({
        start: getDateNDaysAgo(days),
        end: getTodayDate(),
      })
    }
  }

  // When user manually changes date, set dropdown to Custom
  function handleDateChange(which: "start" | "end", value: string) {
    if (!value) return;
    
    // Parse the date value and set to midnight local time
    const [year, month, day] = value.split('-').map(Number);
    const newDate = new Date(year, month - 1, day, 0, 0, 0, 0);
    
    setDateRange((prev) => ({
      ...prev,
      [which]: newDate
    }))
    setSelectedRange("custom")
  }

  // Don't render anything until mounted
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

  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-md mx-auto">
      {/* Time Range Dropdown */}
      <div className="w-full sm:w-auto flex-shrink-0 relative">
        <select
          className="border border-gray-700 rounded-lg px-3 pr-8 py-2 bg-gray-900 text-gray-100 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#FFAA00] focus:border-[#FFAA00] appearance-none w-full cursor-pointer hover:border-gray-600 transition-all duration-200 hover:bg-gray-800"
          value={selectedRange}
          onChange={handleRangeChange}
        >
          {TIME_RANGES.map((r) => (
            <option key={r.value} value={r.value} className="bg-gray-900 text-gray-100">
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
          value={formatDateForInput(dateRange.start)}
          onChange={(e) => handleDateChange("start", e.target.value)}
          max={formatDateForInput(dateRange.end || getTodayDate())}
        />
        <span className="mx-2 text-gray-500 text-xs font-medium select-none">to</span>
        <input
          type="date"
          className="outline-none text-gray-100 text-xs bg-transparent cursor-pointer [color-scheme:dark] focus:text-[#FFAA00] font-mono w-[115px]"
          value={formatDateForInput(dateRange.end)}
          onChange={(e) => handleDateChange("end", e.target.value)}
          min={formatDateForInput(dateRange.start || new Date('2020-01-01'))}
          max={formatDateForInput(getTodayDate())}
        />
      </div>
    </div>
  )
}