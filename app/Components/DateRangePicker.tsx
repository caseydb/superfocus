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
  return d
}

function getTodayDate() {
  return new Date()
}

function formatDateForInput(date: Date | null): string {
  if (!date) return ''
  return date.toISOString().slice(0, 10)
}


export default function DateRangePicker({ value, onChange, firstTaskDate }: DateRangePickerProps) {
  const [selectedRange, setSelectedRange] = useState<number | "custom" | "today" | "all">("all")
  const [dateRange, setDateRange] = useState<DateRange>({
    start: value?.start || (firstTaskDate || new Date('2020-01-01')),
    end: value?.end || getTodayDate()
  })

  // Update parent when dateRange changes
  useEffect(() => {
    onChange?.(dateRange)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange])

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
      setDateRange({
        start: firstTaskDate || new Date('2020-01-01'),
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
    const newDate = value ? new Date(value + 'T00:00:00') : null
    setDateRange((prev) => ({
      ...prev,
      [which]: newDate
    }))
    setSelectedRange("custom")
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
          max={formatDateForInput(dateRange.end || new Date())}
        />
        <span className="mx-2 text-gray-500 text-xs font-medium select-none">to</span>
        <input
          type="date"
          className="outline-none text-gray-100 text-xs bg-transparent cursor-pointer [color-scheme:dark] focus:text-[#FFAA00] font-mono w-[115px]"
          value={formatDateForInput(dateRange.end)}
          onChange={(e) => handleDateChange("end", e.target.value)}
          min={formatDateForInput(dateRange.start || new Date())}
          max={formatDateForInput(new Date())}
        />
      </div>
    </div>
  )
}