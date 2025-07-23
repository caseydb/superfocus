"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import DateRangePicker from "../DateRangePicker";
import { useSelector } from "react-redux";
import { RootState } from "../../store/store";
import type { Task } from "../../store/taskSlice";

interface AnalyticsProps {
  roomId: string;
  userId: string;
  displayName?: string;
  onClose: () => void;
}

interface DayActivity {
  date: string;
  count: number;
  totalSeconds: number;
}

const Analytics: React.FC<AnalyticsProps> = ({ displayName, onClose }) => {
  const [activityData, setActivityData] = useState<DayActivity[]>([]);
  const [colorByTime, setColorByTime] = useState(false);
  const [clientDateRange, setClientDateRange] = useState<{ start: Date | null; end: Date | null }>({
    start: null,
    end: null,
  });
  const [mounted, setMounted] = useState(false);
  
  // Get data from Redux store
  const reduxUser = useSelector((state: RootState) => state.user);
  const userTimezone = useSelector((state: RootState) => state.user.timezone);
  const tasks = useSelector((state: RootState) => state.tasks.tasks);
  const tasksLoading = useSelector((state: RootState) => state.tasks.loading);
  
  // Filter for completed tasks only - memoized to prevent infinite re-renders
  const completedTasks = useMemo(() => {
    console.log('[Analytics] All tasks from Redux:', tasks);
    const completed = tasks.filter((task: Task) => task.status === "completed");
    console.log('[Analytics] Completed tasks:', completed);
    console.log('[Analytics] Completed tasks count:', completed.length);
    
    // Log sample of completed tasks with dates
    if (completed.length > 0) {
      console.log('[Analytics] Sample completed tasks with dates:');
      completed.slice(0, 5).forEach((task, index) => {
        console.log(`  Task ${index + 1}:`, {
          name: task.name,
          completedAt: task.completedAt,
          completedAtDate: task.completedAt ? new Date(task.completedAt).toISOString() : 'null',
          createdAt: task.createdAt,
          createdAtDate: task.createdAt ? new Date(task.createdAt).toISOString() : 'null',
        });
      });
    }
    
    return completed;
  }, [tasks]);

  // Ensure component is mounted before rendering date-dependent content
  useEffect(() => {
    setMounted(true);
  }, []);

  // Get the "streak date" - which day a timestamp belongs to in the 4am local time system
  const getStreakDate = useCallback((timestamp: number) => {
    // Validate timestamp
    if (!timestamp || isNaN(timestamp)) {
      return "1970-01-01";
    }
    
    const date = new Date(timestamp);
    
    // Use user's timezone if available, otherwise fall back to local timezone
    const timezone = userTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    // Debug log for first few calls
    if (Math.random() < 0.01) { // Log 1% of calls to avoid spam
      console.log('[Analytics] getStreakDate debug:', {
        timestamp,
        date: date.toISOString(),
        timezone
      });
    }
    
    
    // Create a proper date formatter for the timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false
    });
    
    // Get the parts
    const parts = formatter.formatToParts(date);
    const dateParts = parts.reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {} as Record<string, string>);
    
    // Extract values
    const year = dateParts.year;
    const month = dateParts.month;
    const day = dateParts.day;
    const hour = parseInt(dateParts.hour);
    
    // If it's before 4am in the user's timezone, count as previous day
    if (hour < 4) {
      const adjustedDate = new Date(date);
      adjustedDate.setDate(adjustedDate.getDate() - 1);
      
      const adjustedParts = formatter.formatToParts(adjustedDate);
      const adjustedDateParts = adjustedParts.reduce((acc, part) => {
        acc[part.type] = part.value;
        return acc;
      }, {} as Record<string, string>);
      
      return `${adjustedDateParts.year}-${adjustedDateParts.month}-${adjustedDateParts.day}`;
    }

    return `${year}-${month}-${day}`;
  }, [userTimezone]);

  // Helper to convert date values to timestamps
  const toTimestamp = (dateValue: string | number | Date): number => {
    if (typeof dateValue === 'string') {
      return new Date(dateValue).getTime();
    }
    if (typeof dateValue === 'number') {
      return dateValue;
    }
    if (dateValue instanceof Date) {
      return dateValue.getTime();
    }
    return 0;
  };

  // Filter tasks by date range - only on client side
  const getFilteredTasks = useCallback((tasksToFilter: Task[]) => {
    // If not mounted, return all tasks (server-side)
    if (!mounted) return tasksToFilter;

    // If no date range selected, return all tasks
    if (!clientDateRange.start || !clientDateRange.end) return tasksToFilter;

    // Client-side filtering
    const startTime = clientDateRange.start.getTime();

    // For single day selection (when start and end dates are the same day at midnight),
    // we need to get the end of that day, not add 24 hours to midnight
    const startDate = new Date(clientDateRange.start);
    const endDate = new Date(clientDateRange.end);

    let endTime: number;
    if (
      startDate.toDateString() === endDate.toDateString() &&
      endDate.getHours() === 0 &&
      endDate.getMinutes() === 0 &&
      endDate.getSeconds() === 0
    ) {
      // Same day at midnight - get end of this day
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);
      endTime = endOfDay.getTime();
    } else {
      // Different days or custom time - add 24 hours to include full end day
      endTime = clientDateRange.end.getTime() + (24 * 60 * 60 * 1000 - 1);
    }

    return tasksToFilter.filter((task) => {
      const timestamp = toTimestamp(task.completedAt || task.createdAt);
      return timestamp >= startTime && timestamp <= endTime;
    });
  }, [mounted, clientDateRange]);

  // Generate activity data for the current calendar year (GitHub-style)
  const generateActivityData = useCallback((tasksToUse: Task[], applyDateFilter: boolean = false) => {
    const today = new Date();
    // Use the year from userTimezone to ensure consistency
    const timezone = userTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const todayInTimezone = new Date(today.toLocaleString("en-US", { timeZone: timezone }));
    const currentYear = todayInTimezone.getFullYear();
    const data: DayActivity[] = [];

    // Filter tasks by date range if requested
    const tasksToProcess = applyDateFilter ? getFilteredTasks(tasksToUse) : tasksToUse;

    // Create maps for date to task count and total time
    const tasksByDate = new Map<string, number>();
    const timeByDate = new Map<string, number>();

    tasksToProcess.forEach((task) => {
      // Get the streak date for proper day boundary handling
      // Use completedAt for completed tasks, fall back to createdAt
      const timestamp = toTimestamp(task.completedAt || task.createdAt);
      const dateStr = getStreakDate(timestamp);
      tasksByDate.set(dateStr, (tasksByDate.get(dateStr) || 0) + 1);

      // Add time for this task
      const seconds = task.timeSpent || 0;
      timeByDate.set(dateStr, (timeByDate.get(dateStr) || 0) + seconds);
    });

    // Debug log removed

    // Start from January 1st of current year
    const startDate = new Date(currentYear, 0, 1);
    const endDate = new Date(currentYear, 11, 31);

    // Find the Sunday of the week containing January 1st
    // But make sure we don't go back to a previous week that ends before Jan 1
    const jan1DayOfWeek = startDate.getDay();
    const firstSunday = new Date(startDate);

    // If Jan 1 is a Sunday (0), start from Jan 1
    // Otherwise, go back to the previous Sunday
    if (jan1DayOfWeek !== 0) {
      firstSunday.setDate(startDate.getDate() - jan1DayOfWeek);
    }

    // Find the Saturday of the week containing December 31st
    const dec31DayOfWeek = endDate.getDay();
    const lastSaturday = new Date(endDate);
    // If Dec 31 is not Saturday (6), advance to the next Saturday
    if (dec31DayOfWeek !== 6) {
      lastSaturday.setDate(endDate.getDate() + (6 - dec31DayOfWeek));
    }

    // Start from the Sunday of the first week
    const currentDate = new Date(firstSunday);
    currentDate.setHours(0, 0, 0, 0);
    lastSaturday.setHours(23, 59, 59, 999);

    // Continue until we've covered the last Saturday
    while (currentDate <= lastSaturday) {
      // Create date string for this calendar day (no timezone conversion needed here)
      // The tasks are already mapped to the correct dates via getStreakDate
      const year = currentDate.getFullYear();
      const month = (currentDate.getMonth() + 1).toString().padStart(2, "0");
      const day = currentDate.getDate().toString().padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;

      // Check if this date is in the past (not future)
      const isPastDate = currentDate <= today;
      const taskCount = tasksByDate.get(dateStr) || 0;

      // If there are tasks but no time recorded, default to 1 minute per task
      const timeSeconds = timeByDate.get(dateStr) || 0;
      const adjustedTimeSeconds = taskCount > 0 && timeSeconds === 0 ? taskCount * 60 : timeSeconds;

      data.push({
        date: dateStr,
        count: isPastDate ? taskCount : 0,
        totalSeconds: isPastDate ? adjustedTimeSeconds : 0,
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return data;
  }, [getFilteredTasks, getStreakDate, userTimezone]);


  // Re-generate activity data when tasks or date range changes
  useEffect(() => {
    if (!tasksLoading) {
      // Debug log removed
      setActivityData(generateActivityData(completedTasks));
    }
  }, [completedTasks, tasksLoading, generateActivityData, getStreakDate]);

  // Calculate analytics metrics
  const calculateMetrics = () => {
    const filteredTasks = getFilteredTasks(completedTasks);
    const totalTasks = filteredTasks.length;

    if (totalTasks === 0) {
      return {
        avgTasksPerDay: 0,
        avgTimePerDay: 0,
        avgTimePerTask: 0,
        totalTime: 0,
        completionRate: 0,
        mostProductiveHour: 12,
      };
    }


    // Calculate the number of active days (days with at least one task)
    const activeDates = filteredTasks.map((t) => {
      const timestamp = toTimestamp(t.completedAt || t.createdAt);
      return getStreakDate(timestamp);
    });
    const uniqueActiveDays = new Set(activeDates).size;
    const daysDiff = Math.max(1, uniqueActiveDays); // Use active days, ensure at least 1

    // Calculate total time
    const totalTime = filteredTasks.reduce((sum, task) => sum + (task.timeSpent || 0), 0);

    // Calculate hourly distribution
    const hourlyCount = new Array(24).fill(0);
    filteredTasks.forEach((task) => {
      const timestamp = toTimestamp(task.completedAt || task.createdAt);
      const hour = new Date(timestamp).getHours();
      hourlyCount[hour]++;
    });
    const mostProductiveHour = hourlyCount.indexOf(Math.max(...hourlyCount));

    return {
      avgTasksPerDay: totalTasks / daysDiff,
      avgTimePerDay: totalTime / daysDiff,
      avgTimePerTask: totalTime / totalTasks,
      totalTime,
      completionRate: 100, // All tasks in filteredTasks are already completed
      mostProductiveHour,
    };
  };

  // Calculate metrics only on client side
  const metrics = mounted
    ? calculateMetrics()
    : {
        avgTasksPerDay: 0,
        avgTimePerDay: 0,
        avgTimePerTask: 0,
        totalTime: 0,
        completionRate: 0,
        mostProductiveHour: 12,
      };

  // Get the earliest task date for display - only on client
  const getFirstTaskDate = () => {
    if (!mounted || completedTasks.length === 0) return null;
    const sortedTasks = [...completedTasks].sort((a, b) => {
      const aTime = toTimestamp(a.completedAt || a.createdAt);
      const bTime = toTimestamp(b.completedAt || b.createdAt);
      return aTime - bTime;
    });
    return new Date(sortedTasks[0].completedAt || sortedTasks[0].createdAt);
  };

  const firstTaskDate = getFirstTaskDate();

  // Don't set initial date range - let the DateRangePicker handle it
  // This avoids any server-side date creation issues

  // Calculate streaks using all task history (not filtered by date range)
  const calculateStreaks = () => {
    console.log('[Analytics] Calculating streaks...');
    console.log('[Analytics] Total completed tasks for streak calc:', completedTasks.length);
    
    // Get unique streak dates (accounting for 4am cutoff)
    const streakDates = completedTasks.map((t) => {
      const timestamp = toTimestamp(t.completedAt || t.createdAt);
      const streakDate = getStreakDate(timestamp);
      return streakDate;
    });
    
    console.log('[Analytics] All streak dates:', streakDates);
    
    const uniqueDateStrings = Array.from(new Set(streakDates));
    const sortedDateStrings = uniqueDateStrings.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    
    console.log('[Analytics] Unique sorted streak dates:', sortedDateStrings);
    console.log('[Analytics] Number of unique days with tasks:', sortedDateStrings.length);

    let longestStreak = 0;
    let currentStreak = 0;

    if (sortedDateStrings.length > 0) {
      let tempStreak = 1;
      longestStreak = 1;

      // Calculate longest streak
      for (let i = 1; i < sortedDateStrings.length; i++) {
        const prevDate = new Date(sortedDateStrings[i - 1]);
        const currDate = new Date(sortedDateStrings[i]);
        const diffTime = currDate.getTime() - prevDate.getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 1) {
          tempStreak++;
          longestStreak = Math.max(longestStreak, tempStreak);
        } else {
          tempStreak = 1;
        }
      }

      // Calculate current streak (working backwards from today)
      const now = Date.now();
      const todayStr = getStreakDate(now);
      const yesterdayStr = getStreakDate(now - 24 * 60 * 60 * 1000);
      
      // Also check tomorrow in case we're in the early morning hours (before 4am)
      // and today's tasks are being counted as tomorrow
      const tomorrowStr = getStreakDate(now + 24 * 60 * 60 * 1000);

      const lastTaskDate = sortedDateStrings[sortedDateStrings.length - 1];
      
      console.log('[Analytics] Current streak check:', {
        todayStr,
        yesterdayStr,
        tomorrowStr,
        lastTaskDate,
        isToday: lastTaskDate === todayStr,
        isYesterday: lastTaskDate === yesterdayStr,
        isTomorrow: lastTaskDate === tomorrowStr,
        timezone: userTimezone || 'default',
        now: new Date().toISOString()
      });

      // Check if the streak is current (task completed today, yesterday, or "tomorrow" due to 4am cutoff)
      if (lastTaskDate === todayStr || lastTaskDate === yesterdayStr || lastTaskDate === tomorrowStr) {
        currentStreak = 1;
        console.log('[Analytics] Current streak is active! Starting count...');
        
        // Work backwards to count consecutive days
        for (let i = sortedDateStrings.length - 2; i >= 0; i--) {
          const prevDateStr = sortedDateStrings[i];
          const currDateStr = sortedDateStrings[i + 1];
          
          // Parse dates and check if they're consecutive
          const prevDate = new Date(prevDateStr);
          const currDate = new Date(currDateStr);
          const diffTime = currDate.getTime() - prevDate.getTime();
          const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
          
          console.log(`[Analytics] Checking consecutive days ${i}:`, {
            prevDateStr,
            currDateStr,
            diffDays,
            isConsecutive: diffDays === 1
          });
          
          if (diffDays === 1) {
            currentStreak++;
          } else {
            break;
          }
        }
      } else {
        console.log('[Analytics] Current streak is NOT active - last task too old');
      }
    }

    console.log('[Analytics] Final streak calculation:', {
      currentStreak,
      longestStreak
    });

    return { currentStreak, longestStreak };
  };

  // Calculate streaks only on client side
  const streakMetrics = mounted ? calculateStreaks() : { currentStreak: 0, longestStreak: 0 };

  // Calculate all-time metrics (using current room data only, matching History component)
  const calculateAllTimeMetrics = () => {
    // Use filtered tasks based on date range
    const filteredTasks = getFilteredTasks(completedTasks);
    const totalTasks = filteredTasks.length;

    // Calculate total time
    const totalSeconds = filteredTasks.reduce((sum, task) => sum + (task.timeSpent || 0), 0);

    return {
      totalTasks,
      totalTime: totalSeconds,
      activeDays: new Set(filteredTasks.map((t) => {
        const timestamp = toTimestamp(t.completedAt || t.createdAt);
        return getStreakDate(timestamp);
      })).size,
    };
  };

  // Calculate all-time metrics only on client side
  const allTimeMetrics = mounted
    ? calculateAllTimeMetrics()
    : {
        totalTasks: 0,
        totalTime: 0,
        activeDays: 0,
      };

  // Get current year for display
  const today = new Date();
  const timezone = userTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const todayInTimezone = new Date(today.toLocaleString("en-US", { timeZone: timezone }));
  const currentYear = todayInTimezone.getFullYear();

  // Format time display
  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  // Get color intensity for activity chart
  const getActivityColor = (count: number, totalSeconds: number = 0) => {
    if (colorByTime) {
      // Color based on time (in minutes)
      const minutes = totalSeconds / 60;
      if (minutes === 0) return "bg-gray-800";
      if (minutes <= 30) return "bg-[#FFAA00]/20";
      if (minutes <= 60) return "bg-[#FFAA00]/40";
      if (minutes <= 120) return "bg-[#FFAA00]/70";
      return "bg-[#FFAA00]";
    } else {
      // Color based on task count
      if (count === 0) return "bg-gray-800";
      if (count <= 2) return "bg-[#FFAA00]/20";
      if (count <= 5) return "bg-[#FFAA00]/40";
      if (count <= 10) return "bg-[#FFAA00]/70";
      return "bg-[#FFAA00]";
    }
  };

  // Handle click outside to close
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fadeIn"
      onClick={handleBackdropClick}
    >
      <div
        className="bg-gray-900 rounded-2xl shadow-2xl px-4 py-4 w-[95%] max-w-[790px] max-h-[90vh] overflow-y-auto border border-gray-700 animate-slideUp custom-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with gradient */}
        <div className="mb-2 text-center relative">
          <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#FFAA00] via-[#FFAA00] to-[#e69500]">
            {reduxUser.first_name ? `${reduxUser.first_name}'s Analytics` : displayName ? `${displayName.split(" ")[0]}'s Analytics` : "Analytics Dashboard"}
          </h2>
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 transition-colors flex items-center justify-center group"
          >
            <svg
              className="w-4 h-4 text-gray-400 group-hover:text-[#FFAA00] transition-colors"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {tasksLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-green-500"></div>
          </div>
        ) : (
          <div>
            {/* GitHub-style Activity Chart */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-bold text-white">{currentYear} Overview</h3>
                {/* Toggle switch */}
                <button
                  onClick={() => setColorByTime(!colorByTime)}
                  className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-300 transition-colors"
                >
                  <span className={colorByTime ? "text-gray-500" : "text-white font-medium"}>Tasks</span>
                  <div className="relative w-10 h-5 bg-gray-700 rounded-full transition-colors">
                    <div
                      className={`absolute top-0.5 h-4 w-4 bg-white rounded-full transition-transform shadow-sm ${
                        colorByTime ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </div>
                  <span className={colorByTime ? "text-white font-medium" : "text-gray-500"}>Time</span>
                </button>
              </div>
              <div className="inline-block relative bg-gray-800/50 rounded-xl p-3 backdrop-blur border border-gray-700 overflow-hidden max-[820px]:overflow-x-auto max-[820px]:block max-[820px]:w-full">
                {/* Month labels - dynamically positioned */}
                <div className="relative mb-2 ml-9 h-4">
                  {(() => {
                    if (activityData.length === 0) return null;

                    const months = [];
                    let currentMonth = -1;
                    let weekIndex = 0;

                    // Process each week to determine month boundaries
                    for (let i = 0; i < activityData.length; i += 7) {
                      // Find the first day in this week that's actually in the current year
                      let firstValidDay = null;
                      for (let j = i; j < Math.min(i + 7, activityData.length); j++) {
                        const date = new Date(activityData[j].date);
                        if (date.getFullYear() === currentYear) {
                          firstValidDay = date;
                          break;
                        }
                      }

                      if (firstValidDay) {
                        const weekMonth = firstValidDay.getMonth();

                        if (weekMonth !== currentMonth) {
                          // New month started
                          months.push({
                            month: weekMonth,
                            weekIndex: weekIndex,
                            name: firstValidDay.toLocaleDateString("en-US", { month: "short", timeZone: userTimezone || undefined }),
                          });
                          currentMonth = weekMonth;
                        }
                      }
                      weekIndex++;
                    }

                    return months.map((item, index) => (
                      <span
                        key={index}
                        className="absolute text-[10px] text-gray-500"
                        style={{ left: `${item.weekIndex * (11 + 2)}px` }} // 11px square + 2px gap
                      >
                        {item.name}
                      </span>
                    ));
                  })()}
                </div>

                {/* Activity grid */}
                <div className="inline-flex gap-1 relative">
                  {/* Activity squares organized by week */}
                  <div className="flex gap-0.5 ml-9">
                    {(() => {
                      // Organize data into weeks (Monday to Sunday)
                      const weeks = [];
                      let currentWeek = new Array(7).fill(null);
                      let weekStarted = false;

                      activityData.forEach((day) => {
                        // Parse date properly to avoid timezone issues
                        const [year, month, dayNum] = day.date.split("-").map(Number);
                        const date = new Date(year, month - 1, dayNum);
                        const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, etc.

                        currentWeek[dayOfWeek] = day;
                        weekStarted = true;

                        // If this is Saturday (last day of week), push the week
                        if (dayOfWeek === 6 && weekStarted) {
                          weeks.push([...currentWeek]);
                          currentWeek = new Array(7).fill(null);
                          weekStarted = false;
                        }
                      });

                      // Add any remaining days as the last week
                      if (weekStarted) {
                        weeks.push(currentWeek);
                      }

                      // Filter out completely empty weeks AND ensure first/last weeks contain Jan 1/Dec 31
                      const filteredWeeks: (DayActivity[] | null)[] = [];
                      let foundJan1Week = 0;
                      let lastWeekWithDec31 = -1;

                      // First pass: find the week with Jan 1 and the week with Dec 31
                      weeks.forEach((week, index) => {
                        if (Array.isArray(week)) {
                          const hasJan1 = week.some((day) => {
                            if (day && day.date) {
                              const date = new Date(day.date);
                              return date.getMonth() === 0 && date.getDate() === 1 && date.getFullYear() === currentYear;
                            }
                            return false;
                          });

                          const hasDec31 = week.some((day) => {
                            if (day && day.date) {
                              const date = new Date(day.date);
                              return date.getMonth() === 11 && date.getDate() === 31 && date.getFullYear() === currentYear;
                            }
                            return false;
                          });

                          if (hasJan1) foundJan1Week = index;
                          if (hasDec31) lastWeekWithDec31 = index;
                        }
                      });

                      // Second pass: only include weeks from Jan 1 week to Dec 31 week
                      weeks.forEach((week, index) => {
                        if (index >= foundJan1Week && index <= lastWeekWithDec31) {
                          filteredWeeks.push(week);
                        }
                      });

                      const nonEmptyWeeks = filteredWeeks;

                      return nonEmptyWeeks.map((week, weekIndex) => {
                        // Don't trim any weeks - show all 7 days
                        return (
                          <div key={weekIndex} className="flex flex-col gap-0.5 relative">
                            {/* Always render 7 days for every week */}
                            {[0, 1, 2, 3, 4, 5, 6].map((dayIndex) => {
                              const day = week ? week[dayIndex] : null;

                              // Add day labels for the first week only
                              const showDayLabel =
                                weekIndex === 0 && (dayIndex === 1 || dayIndex === 3 || dayIndex === 5);
                              const dayLabel = dayIndex === 1 ? "Mon" : dayIndex === 3 ? "Wed" : "Fri";

                              if (!day) {
                                return (
                                  <div key={`empty-${dayIndex}`} className="relative">
                                    <div className="w-[11px] h-[11px]"></div>
                                    {showDayLabel && (
                                      <div className="absolute right-full mr-2 top-0 h-[11px] flex items-center">
                                        <span className="text-[10px] text-gray-500 block w-[20px] text-left">
                                          {dayLabel}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                );
                              }

                              // Parse date components to avoid timezone issues
                              const [year, month, dayNum] = day.date.split("-").map(Number);
                              const date = new Date(year, month - 1, dayNum);
                              
                              return (
                                <div key={dayIndex} className="relative group">
                                  <div
                                    className={`w-[11px] h-[11px] rounded-sm ${getActivityColor(
                                      day.count,
                                      day.totalSeconds
                                    )} hover:ring-2 hover:ring-white transition-all cursor-pointer`}
                                  />
                                  {showDayLabel && (
                                    <div className="absolute right-full mr-2 top-0 h-[11px] flex items-center">
                                      <span className="text-[10px] text-gray-500 block w-[20px] text-left">
                                        {dayLabel}
                                      </span>
                                    </div>
                                  )}
                                  {/* Tooltip */}
                                  <div className="absolute bottom-5 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs rounded px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10 border border-gray-700">
                                    {date.toLocaleDateString("en-US", {
                                      weekday: "short",
                                      month: "short",
                                      day: "numeric",
                                      year: "numeric"
                                    })}
                                    : {day.count} {day.count === 1 ? "task" : "tasks"}
                                    {day.totalSeconds > 0 ? ` | ${formatTime(day.totalSeconds)}` : ""}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>

                {/* Legend */}
                <div className="mt-2 ml-9">
                  <div className="flex items-center gap-2 text-[9px] text-gray-400">
                    <span>Less</span>
                    <div className="flex gap-0.5">
                      <div className="w-[8px] h-[8px] rounded-sm bg-gray-800"></div>
                      <div className="w-[8px] h-[8px] rounded-sm bg-[#FFAA00]/20"></div>
                      <div className="w-[8px] h-[8px] rounded-sm bg-[#FFAA00]/40"></div>
                      <div className="w-[8px] h-[8px] rounded-sm bg-[#FFAA00]/70"></div>
                      <div className="w-[8px] h-[8px] rounded-sm bg-[#FFAA00]"></div>
                    </div>
                    <span>More</span>
                    {colorByTime && (
                      <>
                        <span className="text-gray-500">|</span>
                        <span className="text-gray-500">0-30m | 30-60m | 1-2h | 2h+</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Date Range Picker - Centered */}
            <div className="mb-4">
              <div className="flex justify-center">
                <DateRangePicker value={clientDateRange} onChange={setClientDateRange} firstTaskDate={firstTaskDate} />
              </div>
              {mounted && firstTaskDate && clientDateRange.start && firstTaskDate > clientDateRange.start && (
                <div className="text-center mt-2 text-xs text-gray-400">
                  Calculated from your first task on {firstTaskDate.toLocaleDateString("en-US", { timeZone: userTimezone || undefined })}
                </div>
              )}
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              {/* Average Tasks per Day */}
              <div className="bg-gradient-to-br from-blue-600/20 to-blue-800/20 rounded-lg p-3 border border-blue-700/50 backdrop-blur transform hover:scale-105 transition-transform text-center">
                <div className="text-blue-400 text-xs font-semibold">Avg Tasks/Day</div>
                <div className="text-2xl font-black text-white">{Math.round(metrics.avgTasksPerDay)}</div>
                <div className="text-gray-400 text-xs">Daily average</div>
              </div>

              {/* Average Time per Day */}
              <div className="bg-gradient-to-br from-purple-600/20 to-purple-800/20 rounded-lg p-3 border border-purple-700/50 backdrop-blur transform hover:scale-105 transition-transform text-center">
                <div className="text-purple-400 text-xs font-semibold">Avg Time/Day</div>
                <div className="text-2xl font-black text-white">{formatTime(metrics.avgTimePerDay)}</div>
                <div className="text-gray-400 text-xs">Daily focus time</div>
              </div>

              {/* Average Time per Task */}
              <div className="bg-gradient-to-br from-green-600/20 to-green-800/20 rounded-lg p-3 border border-green-700/50 backdrop-blur transform hover:scale-105 transition-transform text-center">
                <div className="text-green-400 text-xs font-semibold">Avg Time/Task</div>
                <div className="text-2xl font-black text-white">{formatTime(metrics.avgTimePerTask)}</div>
                <div className="text-gray-400 text-xs">Per task average</div>
              </div>
            </div>

            {/* Total Stats */}
            <div className="bg-gradient-to-r from-indigo-600/20 via-purple-600/20 to-pink-600/20 rounded-lg p-3 border border-purple-700/50 backdrop-blur mb-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-black text-white">{allTimeMetrics.totalTasks}</div>
                  <div className="text-gray-300 text-xs font-semibold">Total Tasks</div>
                </div>
                <div>
                  <div className="text-2xl font-black text-white">{formatTime(allTimeMetrics.totalTime)}</div>
                  <div className="text-gray-300 text-xs font-semibold">Total Time</div>
                </div>
                <div>
                  <div className="text-2xl font-black text-white">{allTimeMetrics.activeDays}</div>
                  <div className="text-gray-300 text-xs font-semibold">Active Days</div>
                </div>
              </div>
            </div>

            {/* Streak Analytics - Always shows all-time data */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              {/* Current Streak */}
              <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700 backdrop-blur text-center">
                <div className="flex items-center gap-2 mb-1 justify-center">
                  <span className="text-lg">🔥</span>
                  <h4 className="text-sm font-bold text-white">Current Streak</h4>
                </div>
                <div className="text-xl font-black text-[#FFAA00]">{streakMetrics.currentStreak} days</div>
                <div className="text-gray-400 text-xs">Keep it going!</div>
              </div>

              {/* Longest Streak */}
              <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700 backdrop-blur text-center">
                <div className="flex items-center gap-2 mb-1 justify-center">
                  <span className="text-lg">🏆</span>
                  <h4 className="text-sm font-bold text-white">Best Streak</h4>
                </div>
                <div className="text-xl font-black text-[#FFAA00]">{streakMetrics.longestStreak} days</div>
                <div className="text-gray-400 text-xs">Personal record</div>
              </div>
            </div>

            {/* Keyboard Shortcut Tip */}
            <div className="mt-4 text-center text-xs text-gray-500">
              Shortcut <span className="px-2 py-1 bg-gray-800 rounded">⌘S</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Analytics;
