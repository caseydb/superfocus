"use client";

import React, { useState, useEffect } from "react";
import { rtdb } from "@/lib/firebase";
import { ref, onValue, off } from "firebase/database";
// import DateRangePicker from "../DateRangePicker"; // TEMPORARILY COMMENTED OUT

interface AnalyticsProps {
  roomId: string;
  userId: string;
  displayName?: string;
  onClose: () => void;
}

interface TaskData {
  task: string;
  timestamp: number;
  duration?: number | string;
  completed?: boolean;
  userId?: string;
}

interface DayActivity {
  date: string;
  count: number;
  totalSeconds: number;
}



const Analytics: React.FC<AnalyticsProps> = ({ roomId, userId, displayName, onClose }) => {
  const [taskHistory, setTaskHistory] = useState<TaskData[]>([]);
  const [activityData, setActivityData] = useState<DayActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [colorByTime, setColorByTime] = useState(false);
  const [dateRange, setDateRange] = useState<{ start: Date | null; end: Date | null }>({
    start: null,
    end: null
  });
  const [mounted, setMounted] = useState(false);

  // Ensure component is mounted before rendering date-dependent content
  useEffect(() => {
    setMounted(true);
  }, []);

  // Generate activity data for the current calendar year (GitHub-style)
  const generateActivityData = (tasks: TaskData[], applyDateFilter: boolean = false) => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const data: DayActivity[] = [];
    
    // Filter tasks by date range if requested
    const tasksToProcess = applyDateFilter ? getFilteredTasks() : tasks;

    // Create maps for date to task count and total time
    const tasksByDate = new Map<string, number>();
    const timeByDate = new Map<string, number>();

    tasksToProcess.forEach((task) => {
      // Skip quit tasks
      if (!task.task.toLowerCase().includes("quit early")) {
        const date = new Date(task.timestamp);
        // Use local date string instead of ISO (UTC) date
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, "0");
        const day = date.getDate().toString().padStart(2, "0");
        const dateStr = `${year}-${month}-${day}`;
        tasksByDate.set(dateStr, (tasksByDate.get(dateStr) || 0) + 1);

        // Add time for this task
        const seconds = parseDuration(task.duration);
        timeByDate.set(dateStr, (timeByDate.get(dateStr) || 0) + seconds);
      }
    });

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
      // Create date string in local timezone
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
  };

  // Hardcoded sample data for demo
  const generateSampleData = () => {
    const sampleTasks: TaskData[] = [];
    const today = new Date();
    const currentYear = today.getFullYear();

    // Generate random tasks throughout the current year
    for (let i = 0; i < 500; i++) {
      // Random date within the current year up to today
      const startOfYear = new Date(currentYear, 0, 1);
      const daysSinceStart = Math.floor((today.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
      const daysAgo = Math.floor(Math.random() * daysSinceStart);

      const date = new Date(startOfYear);
      date.setDate(date.getDate() + daysAgo);
      date.setHours(Math.floor(Math.random() * 24));

      const durationSeconds = Math.floor(Math.random() * 3600) + 300; // 5 min to 1 hour
      const hours = Math.floor(durationSeconds / 3600);
      const minutes = Math.floor((durationSeconds % 3600) / 60);
      const seconds = durationSeconds % 60;

      sampleTasks.push({
        task: Math.random() > 0.9 ? `Task ${i + 1} - quit early` : `Task ${i + 1}`,
        timestamp: date.getTime(),
        duration: `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds
          .toString()
          .padStart(2, "0")}`,
        userId: userId,
      });
    }

    return sampleTasks;
  };


  // Re-generate activity data when date range changes
  useEffect(() => {
    if (taskHistory.length > 0) {
      setActivityData(generateActivityData(taskHistory));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, taskHistory]);

  useEffect(() => {
    // Try to fetch real data first
    const historyRef = ref(rtdb, `instances/${roomId}/history`);

    const unsubscribe = onValue(historyRef, (snapshot) => {
      const data = snapshot.val();

      if (data) {
        const allTasks = Object.values(data as Record<string, TaskData>);
        const userTasks = allTasks.filter((task: TaskData) => task.userId === userId);

        setTaskHistory(userTasks);
        setActivityData(generateActivityData(userTasks));
      } else {
        // Use sample data if no real data
        const sampleTasks = generateSampleData();
        setTaskHistory(sampleTasks);
        setActivityData(generateActivityData(sampleTasks));
      }
      setIsLoading(false);
    });

    return () => off(historyRef, "value", unsubscribe);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, userId]);


  // Parse duration string "HH:MM:SS" or "MM:SS" to seconds
  const parseDuration = (duration: string | number | undefined): number => {
    if (typeof duration === "number") return duration;
    if (!duration || typeof duration !== "string") return 0;

    const parts = duration.split(":");
    if (parts.length === 3) {
      const hours = parseInt(parts[0]) || 0;
      const minutes = parseInt(parts[1]) || 0;
      const seconds = parseInt(parts[2]) || 0;
      return hours * 3600 + minutes * 60 + seconds;
    } else if (parts.length === 2) {
      const minutes = parseInt(parts[0]) || 0;
      const seconds = parseInt(parts[1]) || 0;
      return minutes * 60 + seconds;
    }
    return 0;
  };

  // Filter tasks by date range - TEMPORARILY RETURNING ALL TASKS
  const getFilteredTasks = () => {
    return taskHistory; // Return all tasks for now
    /*
    if (!dateRange.start || !dateRange.end) return taskHistory;
    
    const startTime = dateRange.start.getTime();
    const endTime = dateRange.end.getTime() + (24 * 60 * 60 * 1000 - 1); // End of day
    
    return taskHistory.filter(task => {
      return task.timestamp >= startTime && task.timestamp <= endTime;
    });
    */
  };

  // Calculate analytics metrics
  const calculateMetrics = () => {
    const filteredTasks = getFilteredTasks();
    const completedTasks = filteredTasks.filter((t) => !t.task.toLowerCase().includes("quit early"));
    const totalTasks = completedTasks.length;

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

    // Find the earliest task date in the user's history
    let firstTaskDate: Date | null = null;
    if (taskHistory.length > 0) {
      const sortedTasks = [...taskHistory].sort((a, b) => a.timestamp - b.timestamp);
      firstTaskDate = new Date(sortedTasks[0].timestamp);
    }

    
    // Calculate the actual number of days for averages - USING ALL TIME
    let daysDiff = 1;
    if (firstTaskDate) {
      const today = new Date();
      daysDiff = Math.ceil((today.getTime() - firstTaskDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      daysDiff = Math.max(1, daysDiff); // Ensure at least 1 day
    } else if (taskHistory.length > 0) {
      // Fallback: use number of unique days with tasks
      const dates = completedTasks.map((t) => new Date(t.timestamp).toDateString());
      const uniqueDates = new Set(dates).size;
      daysDiff = Math.max(1, uniqueDates);
    }

    // Calculate total time
    const totalTime = completedTasks.reduce((sum, task) => sum + parseDuration(task.duration), 0);

    // Calculate hourly distribution
    const hourlyCount = new Array(24).fill(0);
    completedTasks.forEach((task) => {
      const hour = new Date(task.timestamp).getHours();
      hourlyCount[hour]++;
    });
    const mostProductiveHour = hourlyCount.indexOf(Math.max(...hourlyCount));

    return {
      avgTasksPerDay: totalTasks / daysDiff,
      avgTimePerDay: totalTime / daysDiff,
      avgTimePerTask: totalTime / totalTasks,
      totalTime,
      completionRate: filteredTasks.length > 0 ? (completedTasks.length / filteredTasks.length) * 100 : 0,
      mostProductiveHour,
    };
  };

  const metrics = calculateMetrics();
  
  // Get the earliest task date for display
  const getFirstTaskDate = () => {
    if (taskHistory.length === 0) return null;
    const sortedTasks = [...taskHistory].sort((a, b) => a.timestamp - b.timestamp);
    return new Date(sortedTasks[0].timestamp);
  };
  
  const firstTaskDate = getFirstTaskDate();
  
  // Set initial date range on client side and ensure hydration safety
  useEffect(() => {
    const now = new Date();
    if (mounted && (!dateRange.start || !dateRange.end)) {
      setDateRange({
        start: dateRange.start || (firstTaskDate || new Date('2020-01-01')),
        end: dateRange.end || now
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, firstTaskDate]);
  
  // Calculate streaks using all task history (not filtered by date range)
  const calculateStreaks = () => {
    const allCompletedTasks = taskHistory.filter((t) => !t.task.toLowerCase().includes("quit early"));
    const dates = allCompletedTasks.map((t) => new Date(t.timestamp).toDateString());
    const uniqueDateStrings = Array.from(new Set(dates));
    const sortedDateStrings = uniqueDateStrings.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    
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
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toDateString();
      
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toDateString();
      
      const lastTaskDate = sortedDateStrings[sortedDateStrings.length - 1];
      
      // Check if the streak is current (task completed today or yesterday)
      if (lastTaskDate === todayStr || lastTaskDate === yesterdayStr) {
        currentStreak = 1;
        let checkDate = new Date(lastTaskDate);
        
        // Work backwards to count consecutive days
        for (let i = sortedDateStrings.length - 2; i >= 0; i--) {
          const prevDate = new Date(sortedDateStrings[i]);
          const expectedDate = new Date(checkDate);
          expectedDate.setDate(expectedDate.getDate() - 1);
          
          if (prevDate.toDateString() === expectedDate.toDateString()) {
            currentStreak++;
            checkDate = expectedDate;
          } else {
            break;
          }
        }
      }
    }
    
    return { currentStreak, longestStreak };
  };
  
  const streakMetrics = calculateStreaks();
  
  // Calculate all-time metrics (using current room data only, matching History component)
  const calculateAllTimeMetrics = () => {
    // Use filtered tasks based on date range
    const filteredTasks = getFilteredTasks();
    
    // Filter out quit tasks using the same logic as History
    const completedTasks = filteredTasks.filter((t) => !t.task.toLowerCase().includes("quit early"));
    const totalTasks = completedTasks.length;
    
    // Calculate total time using the same method as History component
    let totalSeconds = 0;
    completedTasks.forEach(task => {
      if (typeof task.duration === 'string') {
        const parts = task.duration.split(":").map(Number);
        if (parts.length === 3) {
          // HH:MM:SS format
          const [hours, minutes, seconds] = parts;
          if (!isNaN(hours) && !isNaN(minutes) && !isNaN(seconds)) {
            totalSeconds += hours * 3600 + minutes * 60 + seconds;
          }
        } else if (parts.length === 2) {
          // MM:SS format
          const [minutes, seconds] = parts;
          if (!isNaN(minutes) && !isNaN(seconds)) {
            totalSeconds += minutes * 60 + seconds;
          }
        }
      } else if (typeof task.duration === 'number') {
        totalSeconds += task.duration;
      }
    });
    
    
    return {
      totalTasks,
      totalTime: totalSeconds,
      activeDays: new Set(completedTasks.map((t) => new Date(t.timestamp).toDateString())).size
    };
  };
  
  const allTimeMetrics = calculateAllTimeMetrics();

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
            {displayName ? `${displayName.split(" ")[0]}'s Analytics` : "Analytics Dashboard"}
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

        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-green-500"></div>
          </div>
        ) : (
          <div>
            {/* GitHub-style Activity Chart */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-bold text-white">2025 Overview</h3>
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
                      // Find the first day in this week that's actually in 2025
                      let firstValidDay = null;
                      for (let j = i; j < Math.min(i + 7, activityData.length); j++) {
                        const date = new Date(activityData[j].date);
                        if (date.getFullYear() === 2025) {
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
                            name: firstValidDay.toLocaleDateString("en-US", { month: "short" }),
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
                              return date.getMonth() === 0 && date.getDate() === 1 && date.getFullYear() === 2025;
                            }
                            return false;
                          });

                          const hasDec31 = week.some((day) => {
                            if (day && day.date) {
                              const date = new Date(day.date);
                              return date.getMonth() === 11 && date.getDate() === 31 && date.getFullYear() === 2025;
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

                              const date = new Date(day.date);
                              return (
                                <div key={dayIndex} className="relative group">
                                  <div
                                    className={`w-[11px] h-[11px] rounded-sm ${getActivityColor(
                                      day.count,
                                      day.totalSeconds
                                    )} hover:ring-2 hover:ring-white transition-all cursor-pointer`}
                                    title={`${day.date}: ${day.count} tasks`}
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
                                    })}
                                    : {day.count} tasks
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
            {/* TEMPORARILY COMMENTED OUT - PRODUCTION ERROR
            <div className="mb-4">
              <div className="flex justify-center">
                {mounted && (
                  <DateRangePicker
                    value={dateRange}
                    onChange={setDateRange}
                    firstTaskDate={firstTaskDate}
                  />
                )}
              </div>
              {mounted && firstTaskDate && dateRange.start && firstTaskDate > dateRange.start && (
                <div className="text-center mt-2 text-xs text-gray-400">
                  Calculated from your first task on {firstTaskDate.toLocaleDateString('en-US')}
                </div>
              )}
            </div>
            */}

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
                  <div className="text-2xl font-black text-white">
                    {allTimeMetrics.totalTasks}
                  </div>
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
                <div className="text-xl font-black text-[#FFAA00]">
                  {streakMetrics.currentStreak} days
                </div>
                <div className="text-gray-400 text-xs">Keep it going!</div>
              </div>

              {/* Longest Streak */}
              <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700 backdrop-blur text-center">
                <div className="flex items-center gap-2 mb-1 justify-center">
                  <span className="text-lg">🏆</span>
                  <h4 className="text-sm font-bold text-white">Best Streak</h4>
                </div>
                <div className="text-xl font-black text-[#FFAA00]">
                  {streakMetrics.longestStreak} days
                </div>
                <div className="text-gray-400 text-xs">Personal record</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Analytics;
