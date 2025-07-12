"use client";

import React, { useState, useEffect } from "react";
import { rtdb } from "@/lib/firebase";
import { ref, onValue, off } from "firebase/database";

interface AnalyticsProps {
  roomId: string;
  userId: string;
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
}

const Analytics: React.FC<AnalyticsProps> = ({ roomId, userId, onClose }) => {
  const [taskHistory, setTaskHistory] = useState<TaskData[]>([]);
  const [activityData, setActivityData] = useState<DayActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Generate activity data for the current calendar year (GitHub-style)
  const generateActivityData = (tasks: TaskData[]) => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const data: DayActivity[] = [];

    // Create a map of date to task count
    const tasksByDate = new Map<string, number>();

    tasks.forEach((task) => {
      // Count task if completed is true OR undefined (legacy tasks didn't have this field)
      // Only skip if explicitly false (quit tasks)
      if (task.completed !== false) {
        const date = new Date(task.timestamp);
        // Use local date string instead of ISO (UTC) date
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, "0");
        const day = date.getDate().toString().padStart(2, "0");
        const dateStr = `${year}-${month}-${day}`;
        tasksByDate.set(dateStr, (tasksByDate.get(dateStr) || 0) + 1);
      }
    });

    // Start from January 1st of current year
    const startDate = new Date(currentYear, 0, 1);
    const endDate = new Date(currentYear, 11, 31);

    // Start from January 1st regardless of what day it is
    const currentDate = new Date(startDate);
    while (currentDate.getFullYear() <= currentYear || currentDate.getDay() !== 1) {
      // Create date string in local timezone
      const year = currentDate.getFullYear();
      const month = (currentDate.getMonth() + 1).toString().padStart(2, "0");
      const day = currentDate.getDate().toString().padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;

      // Only count tasks for dates within the current year and not in the future
      const isCurrentYear = currentDate.getFullYear() === currentYear;
      const isPastDate = currentDate <= today;
      const taskCount = tasksByDate.get(dateStr) || 0;

      data.push({
        date: dateStr,
        count: isCurrentYear && isPastDate ? taskCount : 0,
      });

      currentDate.setDate(currentDate.getDate() + 1);

      // Stop if we've completed the last week that contains Dec 31
      if (currentDate.getDay() === 1 && currentDate > endDate) {
        break;
      }
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
        task: `Task ${i + 1}`,
        timestamp: date.getTime(),
        duration: `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds
          .toString()
          .padStart(2, "0")}`,
        completed: Math.random() > 0.1, // 90% completion rate
        userId: userId,
      });
    }

    return sampleTasks;
  };

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
  }, [roomId, userId]);

  // Parse duration string "HH:MM:SS" to seconds
  const parseDuration = (duration: string | number | undefined): number => {
    if (typeof duration === "number") return duration;
    if (!duration || typeof duration !== "string") return 0;

    const parts = duration.split(":");
    if (parts.length === 3) {
      const hours = parseInt(parts[0]) || 0;
      const minutes = parseInt(parts[1]) || 0;
      const seconds = parseInt(parts[2]) || 0;
      return hours * 3600 + minutes * 60 + seconds;
    }
    return 0;
  };

  // Calculate analytics metrics
  const calculateMetrics = () => {
    const completedTasks = taskHistory.filter((t) => t.completed !== false);
    const totalTasks = completedTasks.length;

    if (totalTasks === 0) {
      return {
        avgTasksPerDay: 0,
        avgTimePerDay: 0,
        avgTimePerTask: 0,
        totalTime: 0,
        completionRate: 0,
        mostProductiveHour: 12,
        currentStreak: 0,
        longestStreak: 0,
      };
    }

    // Calculate date range
    const dates = completedTasks.map((t) => new Date(t.timestamp).toDateString());
    const uniqueDates = new Set(dates).size;

    // Calculate total time
    const totalTime = completedTasks.reduce((sum, task) => sum + parseDuration(task.duration), 0);

    // Calculate hourly distribution
    const hourlyCount = new Array(24).fill(0);
    completedTasks.forEach((task) => {
      const hour = new Date(task.timestamp).getHours();
      hourlyCount[hour]++;
    });
    const mostProductiveHour = hourlyCount.indexOf(Math.max(...hourlyCount));

    // Calculate streaks
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

    return {
      avgTasksPerDay: totalTasks / uniqueDates,
      avgTimePerDay: totalTime / uniqueDates,
      avgTimePerTask: totalTime / totalTasks,
      totalTime,
      completionRate: taskHistory.length > 0 ? (completedTasks.length / taskHistory.length) * 100 : 0,
      mostProductiveHour,
      currentStreak,
      longestStreak,
    };
  };

  const metrics = calculateMetrics();

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
  const getActivityColor = (count: number) => {
    if (count === 0) return "bg-gray-800";
    if (count <= 2) return "bg-green-900";
    if (count <= 5) return "bg-green-700";
    if (count <= 10) return "bg-green-500";
    return "bg-green-400";
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
        className="bg-gray-900 rounded-2xl shadow-2xl px-4 py-3 w-[95%] max-w-[1200px] max-h-[90vh] overflow-y-auto border border-gray-700 animate-slideUp custom-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with gradient */}
        <div className="mb-2 text-center relative">
          <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#FFAA00] via-[#FFAA00] to-[#e69500]">
            Analytics Dashboard
          </h2>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-green-500"></div>
          </div>
        ) : (
          <>
            {/* GitHub-style Activity Chart */}
            <div className="mb-4">
              <h3 className="text-lg font-bold text-white mb-2">2025 Activity Overview</h3>
              <div className="bg-gray-800/50 rounded-xl p-3 pr-5 backdrop-blur border border-gray-700 overflow-x-auto flex flex-col items-center">
                <div>
                  {/* Month labels */}
                  <div className="flex gap-1 mb-2 ml-11">
                    {(() => {
                      const months = [];
                      if (activityData.length === 0) return null;

                      let currentMonth = -1;
                      let weekIndex = 0;
                      let weekStartIndex = 0;

                      // Process each week to determine month boundaries
                      for (let i = 0; i < activityData.length; i += 7) {
                        const weekStart = new Date(activityData[i].date);
                        const weekMonth = weekStart.getMonth();

                        // Initialize month tracking
                        if (currentMonth === -1) {
                          currentMonth = weekMonth;
                          weekStartIndex = weekIndex;
                        } else if (weekMonth !== currentMonth) {
                          // Month changed, record the previous month
                          months.push({
                            month: currentMonth,
                            startWeek: weekStartIndex,
                            weeks: weekIndex - weekStartIndex,
                          });
                          currentMonth = weekMonth;
                          weekStartIndex = weekIndex;
                        }
                        weekIndex++;
                      }

                      // Add the last month
                      if (currentMonth !== -1) {
                        months.push({
                          month: currentMonth,
                          startWeek: weekStartIndex,
                          weeks: weekIndex - weekStartIndex,
                        });
                      }

                      return months.map((item, index) => {
                        const monthName = new Date(2024, item.month).toLocaleDateString("en-US", { month: "short" });
                        return (
                          <div key={index} style={{ width: `${item.weeks * 17}px` }} className="text-xs text-gray-500">
                            {monthName}
                          </div>
                        );
                      });
                    })()}
                  </div>

                  {/* Activity grid */}
                  <div className="flex gap-1">
                    {/* Day labels */}
                    <div className="flex flex-col gap-1 text-xs text-gray-500 pr-2">
                      <div className="h-[13px] flex items-center text-[10px]">Mon</div>
                      <div className="h-[13px]"></div>
                      <div className="h-[13px] flex items-center text-[10px]">Wed</div>
                      <div className="h-[13px]"></div>
                      <div className="h-[13px] flex items-center text-[10px]">Fri</div>
                      <div className="h-[13px]"></div>
                      <div className="h-[13px] flex items-center text-[10px]">Sun</div>
                    </div>

                    {/* Activity squares organized by week */}
                    <div className="flex gap-1">
                      {(() => {
                        // Organize data into weeks (Monday to Sunday)
                        const weeks = [];
                        let currentWeek = new Array(7).fill(null);
                        let weekStarted = false;

                        activityData.forEach((day) => {
                          const date = new Date(day.date);
                          const dayOfWeek = date.getDay();
                          // Convert Sunday (0) to 6, Monday (1) to 0, etc.
                          const adjustedDayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

                          currentWeek[adjustedDayIndex] = day;
                          weekStarted = true;

                          // If this is Sunday (last day of week), push the week
                          if (dayOfWeek === 0 && weekStarted) {
                            weeks.push([...currentWeek]);
                            currentWeek = new Array(7).fill(null);
                            weekStarted = false;
                          }
                        });

                        // Add any remaining days as the last week
                        if (weekStarted) {
                          weeks.push(currentWeek);
                        }

                        return weeks.map((week, weekIndex) => (
                          <div key={weekIndex} className="flex flex-col gap-1">
                            {week.map((day, dayIndex) => {
                              if (!day) {
                                return <div key={`empty-${dayIndex}`} className="w-[13px] h-[13px]"></div>;
                              }

                              const date = new Date(day.date);
                              return (
                                <div key={dayIndex} className="relative group">
                                  <div
                                    className={`w-[13px] h-[13px] rounded-sm ${getActivityColor(
                                      day.count
                                    )} hover:ring-2 hover:ring-white transition-all cursor-pointer`}
                                    title={`${day.date}: ${day.count} tasks`}
                                  />
                                  {/* Tooltip */}
                                  <div className="absolute bottom-5 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs rounded px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10 border border-gray-700">
                                    {date.toLocaleDateString("en-US", {
                                      weekday: "short",
                                      month: "short",
                                      day: "numeric",
                                    })}
                                    : {day.count} tasks
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ));
                      })()}
                    </div>
                  </div>

                  {/* Legend */}
                  <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
                    <span>Less</span>
                    <div className="flex gap-1">
                      <div className="w-[13px] h-[13px] rounded-sm bg-gray-800"></div>
                      <div className="w-[13px] h-[13px] rounded-sm bg-green-900"></div>
                      <div className="w-[13px] h-[13px] rounded-sm bg-green-700"></div>
                      <div className="w-[13px] h-[13px] rounded-sm bg-green-500"></div>
                      <div className="w-[13px] h-[13px] rounded-sm bg-green-400"></div>
                    </div>
                    <span>More</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              {/* Average Tasks per Day */}
              <div className="bg-gradient-to-br from-blue-600/20 to-blue-800/20 rounded-lg p-3 border border-blue-700/50 backdrop-blur transform hover:scale-105 transition-transform">
                <div className="text-blue-400 text-xs font-semibold">Avg Tasks/Day</div>
                <div className="text-2xl font-black text-white">{metrics.avgTasksPerDay.toFixed(1)}</div>
                <div className="text-gray-400 text-xs">Daily average</div>
              </div>

              {/* Average Time per Day */}
              <div className="bg-gradient-to-br from-purple-600/20 to-purple-800/20 rounded-lg p-3 border border-purple-700/50 backdrop-blur transform hover:scale-105 transition-transform">
                <div className="text-purple-400 text-xs font-semibold">Avg Time/Day</div>
                <div className="text-2xl font-black text-white">{formatTime(metrics.avgTimePerDay)}</div>
                <div className="text-gray-400 text-xs">Daily focus time</div>
              </div>

              {/* Average Time per Task */}
              <div className="bg-gradient-to-br from-green-600/20 to-green-800/20 rounded-lg p-3 border border-green-700/50 backdrop-blur transform hover:scale-105 transition-transform">
                <div className="text-green-400 text-xs font-semibold">Avg Time/Task</div>
                <div className="text-2xl font-black text-white">{formatTime(metrics.avgTimePerTask)}</div>
                <div className="text-gray-400 text-xs">Per task average</div>
              </div>
            </div>

            {/* Additional Insights */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              {/* Current Streak */}
              <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700 backdrop-blur">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">🔥</span>
                  <h4 className="text-sm font-bold text-white">Current Streak</h4>
                </div>
                <div className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-600">
                  {metrics.currentStreak} days
                </div>
                <div className="text-gray-400 text-xs">Keep it going!</div>
              </div>

              {/* Longest Streak */}
              <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700 backdrop-blur">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">🏆</span>
                  <h4 className="text-sm font-bold text-white">Best Streak</h4>
                </div>
                <div className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-green-600">
                  {metrics.longestStreak} days
                </div>
                <div className="text-gray-400 text-xs">Personal record</div>
              </div>
            </div>

            {/* Total Stats */}
            <div className="bg-gradient-to-r from-indigo-600/20 via-purple-600/20 to-pink-600/20 rounded-lg p-3 border border-purple-700/50 backdrop-blur mb-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-black text-white">
                    {taskHistory.filter((t) => t.completed !== false).length}
                  </div>
                  <div className="text-gray-300 text-xs font-semibold">Total Tasks</div>
                </div>
                <div>
                  <div className="text-2xl font-black text-white">{formatTime(metrics.totalTime)}</div>
                  <div className="text-gray-300 text-xs font-semibold">Total Time</div>
                </div>
                <div>
                  <div className="text-2xl font-black text-white">
                    {activityData.filter((d) => d.count > 0).length}
                  </div>
                  <div className="text-gray-300 text-xs font-semibold">Active Days</div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Close button */}
        <div className="flex justify-center">
          <button
            onClick={onClose}
            className="mt-1 bg-[#FFAA00] text-black font-extrabold text-base px-6 py-2 rounded-lg shadow hover:scale-105 transition-transform"
          >
            Close
          </button>
        </div>
      </div>

      {/* Add animations */}
      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes goldPulse {
          0%,
          100% {
            opacity: 1;
            filter: brightness(1);
          }
          50% {
            opacity: 0.8;
            filter: brightness(1.3);
          }
        }

        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }

        .animate-slideUp {
          animation: slideUp 0.4s ease-out;
        }

        .animate-goldPulse {
          animation: goldPulse 2s ease-in-out infinite;
        }

        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }

        .custom-scrollbar::-webkit-scrollbar-track {
          background: #1f2937;
          border-radius: 4px;
        }

        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #ffaa00;
          border-radius: 4px;
        }

        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #ff9500;
        }
      `}</style>
    </div>
  );
};

export default Analytics;
