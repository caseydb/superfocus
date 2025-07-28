"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import DateRangePicker from "../DateRangePicker";
import { useSelector } from "react-redux";
import { RootState } from "../../store/store";
import type { Task } from "../../store/taskSlice";
import { DotSpinner } from 'ldrs/react';
import 'ldrs/react/DotSpinner.css';
import { auth } from '@/lib/firebase';
import FirecapeSquare from "../FirecapeSquare";

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

interface SuperadminUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  completed_tasks_count: number;
  display_name: string;
  timezone?: string;
  tasks?: Task[];
}

const Analytics: React.FC<AnalyticsProps> = ({ displayName, onClose }) => {
  const [activityData, setActivityData] = useState<DayActivity[]>([]);
  const [colorByTime, setColorByTime] = useState(false);
  const [superadminUsers, setSuperadminUsers] = useState<SuperadminUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("personal");
  const hasLoadedUsers = useRef(false);
  
  // Get data from Redux store
  const reduxUser = useSelector((state: RootState) => state.user);
  const userTimezone = useSelector((state: RootState) => state.user.timezone);
  const tasks = useSelector((state: RootState) => state.tasks.tasks);
  const tasksLoading = useSelector((state: RootState) => state.tasks.loading);
  const savedDatePicker = useSelector((state: RootState) => state.preferences.analytics_date_pick);
  
  // Filter for completed tasks only - memoized to prevent infinite re-renders
  // Get selected user data when viewing another user
  const selectedUserData = useMemo(() => {
    if (selectedUserId === "personal" || !superadminUsers.length) return null;
    return superadminUsers.find(user => user.id === selectedUserId);
  }, [selectedUserId, superadminUsers]);

  // Determine which tasks and user info to use
  const isViewingOtherUser = selectedUserId !== "personal" && selectedUserData;
  // const displayUser = isViewingOtherUser ? selectedUserData : reduxUser;
  const displayTimezone = isViewingOtherUser ? selectedUserData.timezone : userTimezone;

  // Get tasks based on viewing mode
  const completedTasks = useMemo(() => {
    if (isViewingOtherUser && selectedUserData) {
      // Use selected user's tasks - they're already filtered for completed status
      return selectedUserData.tasks || [];
    } else {
      // Use Redux store tasks for personal view
      const completed = tasks.filter((task: Task) => task.status === "completed");
      
      
      return completed;
    }
  }, [tasks, isViewingOtherUser, selectedUserData]);

  // Helper function to get first task date early
  const getFirstTaskDateEarly = useCallback(() => {
    if (completedTasks.length === 0) return null;
    const sortedTasks = [...completedTasks].sort((a, b) => {
      const aTime = a.completedAt || a.createdAt;
      const bTime = b.completedAt || b.createdAt;
      return aTime - bTime;
    });
    return new Date(sortedTasks[0].completedAt || sortedTasks[0].createdAt);
  }, [completedTasks]);

  // Helper to get date range based on saved preference
  const getInitialDateRange = useCallback((preference: string, firstTaskDate: Date | null): { start: Date | null; end: Date | null } => {
    const getTodayDate = () => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d;
    };

    const getDateNDaysAgo = (n: number) => {
      const d = new Date();
      d.setDate(d.getDate() - n + 1);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    const getThisWeekStart = () => {
      const d = new Date();
      const day = d.getDay();
      const diff = day === 0 ? 6 : day - 1;
      d.setDate(d.getDate() - diff);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    const getThisMonthStart = () => {
      const d = new Date();
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    switch (preference) {
      case "today":
        const today = getTodayDate();
        return { start: today, end: today };
      case "this_week":
        const weekStart = getThisWeekStart();
        return {
          start: firstTaskDate && firstTaskDate > weekStart ? firstTaskDate : weekStart,
          end: getTodayDate()
        };
      case "this_month":
        const monthStart = getThisMonthStart();
        return {
          start: firstTaskDate && firstTaskDate > monthStart ? firstTaskDate : monthStart,
          end: getTodayDate()
        };
      case "7_days":
      case "14_days":
      case "30_days":
      case "90_days":
      case "365_days":
        const daysMatch = preference.match(/^(\d+)_days$/);
        if (daysMatch) {
          const days = Number(daysMatch[1]);
          const startDate = getDateNDaysAgo(days);
          return {
            start: firstTaskDate && firstTaskDate > startDate ? firstTaskDate : startDate,
            end: getTodayDate()
          };
        }
        return { start: null, end: null };
      case "all_time":
      default:
        return {
          start: firstTaskDate || new Date("2020-01-01"),
          end: getTodayDate()
        };
    }
  }, []);

  // Initialize clientDateRange based on saved preference
  const [clientDateRange, setClientDateRange] = useState<{ start: Date | null; end: Date | null }>(() => {
    const firstTaskDate = getFirstTaskDateEarly();
    return getInitialDateRange(savedDatePicker || "all_time", firstTaskDate);
  });
  
  const [mounted, setMounted] = useState(false);

  // Ensure component is mounted before rendering date-dependent content
  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch superadmin users when dropdown is clicked
  const fetchSuperadminUsers = useCallback(async () => {
    if (hasLoadedUsers.current || isLoadingUsers) {
      return;
    }
    
    setIsLoadingUsers(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        console.error("No authenticated user");
        return;
      }

      const token = await currentUser.getIdToken();
      
      const response = await fetch('/api/superadmin/analytics', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        console.error("Failed to fetch superadmin users - Status:", response.status);
        return;
      }

      const data = await response.json();
      
      setSuperadminUsers(data.users || []);
      hasLoadedUsers.current = true;
    } catch (error) {
      console.error("Error fetching superadmin users:", error);
    } finally {
      setIsLoadingUsers(false);
    }
  }, [isLoadingUsers]);

  // Update date range when tasks or saved preference changes
  useEffect(() => {
    if (mounted && completedTasks.length > 0 && savedDatePicker) {
      const firstTaskDate = getFirstTaskDateEarly();
      const newRange = getInitialDateRange(savedDatePicker, firstTaskDate);
      setClientDateRange((prevRange) => {
        // Only update if the range has actually changed to avoid unnecessary re-renders
        if (
          prevRange.start?.getTime() !== newRange.start?.getTime() ||
          prevRange.end?.getTime() !== newRange.end?.getTime()
        ) {
          return newRange;
        }
        return prevRange;
      });
    }
  }, [mounted, savedDatePicker, completedTasks.length, getFirstTaskDateEarly, getInitialDateRange]);

  // Get the "streak date" - which day a timestamp belongs to (midnight to midnight)
  const getStreakDate = useCallback((timestamp: number) => {
    // Validate timestamp
    if (!timestamp || isNaN(timestamp)) {
      return "1970-01-01";
    }
    
    // Always convert timestamps to the appropriate timezone
    // For SuperAdmin viewing other users, use the selected user's timezone
    // For personal view, use the current user's timezone
    const date = new Date(timestamp);
    const timezone = displayTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    // Create a proper date formatter for the timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
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
    
    const result = `${year}-${month}-${day}`;
    
    return result;
  }, [displayTimezone]);

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
    const timezone = displayTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
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
  }, [getFilteredTasks, getStreakDate, displayTimezone]);


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
    
    // Get unique streak dates
    const streakDates = completedTasks.map((t) => {
      const timestamp = toTimestamp(t.completedAt || t.createdAt);
      const streakDate = getStreakDate(timestamp);
      return streakDate;
    });
    
    
    const uniqueDateStrings = Array.from(new Set(streakDates));
    const sortedDateStrings = uniqueDateStrings.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    
    // Calculate last 30 days and check for streaks
    if (selectedUserId !== "personal" && selectedUserData) {
      const now = Date.now();
      // const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
      
      console.log("Last 30 days:");
      console.log(`User timezone: ${displayTimezone}`);
      
      // Debug: Show what's happening with specific tasks
      console.log("\n=== TIMEZONE DEBUGGING ===");
      
      // Find tasks that should be on July 21st based on your database
      const suspectTasks = completedTasks.filter(t => {
        const taskName = t.name.toLowerCase();
        return taskName.includes('adjust instance') || 
               taskName.includes('add icons') || 
               taskName.includes('cover images') ||
               taskName.includes('assign task to email');
      });
      
      if (suspectTasks.length > 0) {
        console.log(`\nAnalyzing tasks that should be on July 21st:`);
        suspectTasks.forEach(task => {
          const timestamp = toTimestamp(task.completedAt || task.createdAt);
          const date = new Date(timestamp);
          const streakDate = getStreakDate(timestamp);
          
          // Show what the date would be in Pacific/Auckland
          const aucklandDate = date.toLocaleString('en-US', { 
            timeZone: 'Pacific/Auckland',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          });
          
          console.log(`\nTask: "${task.name}"`);
          console.log(`  Raw completedAt: ${task.completedAt}`);
          console.log(`  Timestamp: ${timestamp}`);
          console.log(`  As UTC: ${date.toISOString()}`);
          console.log(`  In Auckland: ${aucklandDate}`);
          console.log(`  Streak date calculated: ${streakDate}`);
          console.log(`  Task timezone field: ${(task as { timezone?: string }).timezone || 'Not set'}`);
        });
      }
      
      console.log(`\nAll unique task dates: ${sortedDateStrings.join(', ')}`);
      
      // Check if any tasks might be showing on July 20th or 22nd instead
      const nearbyDates = ['2025-07-20', '2025-07-21', '2025-07-22'];
      nearbyDates.forEach(dateStr => {
        const tasksOnDate = completedTasks.filter(t => {
          const timestamp = toTimestamp(t.completedAt || t.createdAt);
          const taskDate = getStreakDate(timestamp);
          return taskDate === dateStr;
        });
        if (tasksOnDate.length > 0) {
          console.log(`\nTasks on ${dateStr}: ${tasksOnDate.length} tasks`);
          tasksOnDate.slice(0, 2).forEach(task => {
            const timestamp = toTimestamp(task.completedAt || task.createdAt);
            const date = new Date(timestamp);
            console.log(`  - "${task.name}" at ${date.toISOString()}`);
          });
        }
      });
      
      // Create array of all dates in last 30 days
      const last30Days = [];
      for (let i = 29; i >= 0; i--) {
        const dayTimestamp = now - (i * 24 * 60 * 60 * 1000);
        const dayStr = getStreakDate(dayTimestamp);
        const hasTask = uniqueDateStrings.includes(dayStr);
        last30Days.push({ date: dayStr, hasTask });
      }
      
      // Log each day and whether it counts towards a streak
      console.log("\nDay by day breakdown:");
      last30Days.forEach((day) => {
        console.log(`${day.date}: ${day.hasTask}`);
      });
    }
    
    

    let longestStreak = 0;
    let currentStreak = 0;

    if (sortedDateStrings.length > 0) {
      let tempStreak = 1;
      longestStreak = 1;

      // Calculate longest streak by checking consecutive calendar days
      
      for (let i = 1; i < sortedDateStrings.length; i++) {
        const prevDateStr = sortedDateStrings[i - 1];
        const currDateStr = sortedDateStrings[i];
        
        // Parse the date strings to get year, month, day
        const [prevYear, prevMonth, prevDay] = prevDateStr.split('-').map(Number);
        const [currYear, currMonth, currDay] = currDateStr.split('-').map(Number);
        
        // Create dates at noon to avoid any timezone edge cases
        const prevDate = new Date(prevYear, prevMonth - 1, prevDay, 12, 0, 0);
        const currDate = new Date(currYear, currMonth - 1, currDay, 12, 0, 0);
        
        // Check if dates are consecutive calendar days
        const nextDay = new Date(prevDate);
        nextDay.setDate(nextDay.getDate() + 1);
        
        const isConsecutive = (
          nextDay.getFullYear() === currDate.getFullYear() &&
          nextDay.getMonth() === currDate.getMonth() &&
          nextDay.getDate() === currDate.getDate()
        );


        if (isConsecutive) {
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
      
      const lastTaskDate = sortedDateStrings[sortedDateStrings.length - 1];
      
      // Check if the streak is current (task completed today or yesterday)
      if (lastTaskDate === todayStr || lastTaskDate === yesterdayStr) {
        currentStreak = 1;
        
        
        // Work backwards to count consecutive days
        for (let i = sortedDateStrings.length - 2; i >= 0; i--) {
          const prevDateStr = sortedDateStrings[i];
          const currDateStr = sortedDateStrings[i + 1];
          
          // Parse the date strings to get year, month, day
          const [prevYear, prevMonth, prevDay] = prevDateStr.split('-').map(Number);
          const [currYear, currMonth, currDay] = currDateStr.split('-').map(Number);
          
          // Create dates at noon to avoid any timezone edge cases
          const prevDate = new Date(prevYear, prevMonth - 1, prevDay, 12, 0, 0);
          const currDate = new Date(currYear, currMonth - 1, currDay, 12, 0, 0);
          
          // Check if dates are consecutive calendar days
          const nextDay = new Date(prevDate);
          nextDay.setDate(nextDay.getDate() + 1);
          
          const isConsecutive = (
            nextDay.getFullYear() === currDate.getFullYear() &&
            nextDay.getMonth() === currDate.getMonth() &&
            nextDay.getDate() === currDate.getDate()
          );
          
          
          if (isConsecutive) {
            currentStreak++;
          } else {
            break;
          }
        }
        
      }
    }
    


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
  const timezone = displayTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
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
      // Color based on time
      if (totalSeconds === 0) return "bg-gray-800";
      if (totalSeconds < 1800) return "bg-[#FFAA00]/20"; // Less than 30 min
      if (totalSeconds < 3600) return "bg-[#FFAA00]/40"; // 30 min - 1 hour
      if (totalSeconds < 18000) return "bg-[#FFAA00]/70"; // 1-5 hours
      if (totalSeconds < 36000) return "bg-[#FFAA00]"; // 5-10 hours
      return "bg-[#FFAA00] animate-blaze"; // 10+ hours - epic blaze effect
    } else {
      // Color based on task count
      if (count === 0) return "bg-gray-800";
      if (count === 1) return "bg-[#FFAA00]/20";
      if (count <= 4) return "bg-[#FFAA00]/40";
      if (count <= 9) return "bg-[#FFAA00]/70";
      if (count <= 19) return "bg-[#FFAA00]"; // 10-19 tasks
      return "bg-[#FFAA00] animate-blaze"; // 20+ tasks - epic blaze effect
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0b0b]/95 backdrop-blur-sm animate-fadeIn"
      onClick={handleBackdropClick}
    >
      <div
        className="bg-gray-900 rounded-2xl shadow-2xl px-4 py-4 w-[95%] max-w-[790px] max-h-[90vh] overflow-y-auto border border-gray-700 animate-slideUp custom-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with gradient */}
        <div className="mb-2 text-center relative">
          <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#FFAA00] via-[#FFAA00] to-[#e69500]">
            {isViewingOtherUser && selectedUserData 
              ? `${selectedUserData.first_name}'s Analytics`
              : reduxUser.first_name 
                ? `${reduxUser.first_name}'s Analytics` 
                : displayName 
                  ? `${displayName.split(" ")[0]}'s Analytics` 
                  : "Analytics Dashboard"}
          </h2>
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 transition-colors flex items-center justify-center group cursor-pointer"
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
            <DotSpinner size="40" speed="0.9" color="#FFAA00" />
          </div>
        ) : (
          <div>
            {/* GitHub-style Activity Chart */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-bold text-white">{currentYear} Overview</h3>
                
                {/* Special dropdown for specific user */}
                {reduxUser.user_id === "df3aed2a-ad51-457f-b0cd-f7d4225143d4" && (
                  <div className="flex items-center gap-4">
                    <select 
                      className="bg-gray-800 text-white text-sm rounded-lg px-3 py-1.5 border border-gray-700 hover:border-gray-600 focus:border-[#FFAA00] focus:outline-none transition-colors cursor-pointer"
                      value={selectedUserId}
                      onChange={(e) => setSelectedUserId(e.target.value)}
                      onFocus={fetchSuperadminUsers}
                      onClick={fetchSuperadminUsers}
                    >
                      <option value="personal">Analytics</option>
                      {isLoadingUsers && superadminUsers.length === 0 && (
                        <option disabled>Loading users...</option>
                      )}
                      {superadminUsers.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.display_name} ({user.completed_tasks_count})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                
                {/* Toggle switch */}
                <button
                  onClick={() => setColorByTime(!colorByTime)}
                  className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-300 transition-colors cursor-pointer"
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
                            name: firstValidDay.toLocaleDateString("en-US", { month: "short", timeZone: displayTimezone || undefined }),
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
                              
                              // Check if this is the highest tier (10h+ or 20+ tasks)
                              const isHighestTier = colorByTime 
                                ? day.totalSeconds >= 36000 
                                : day.count >= 20;
                              
                              return (
                                <div key={dayIndex} className="relative group">
                                  {isHighestTier ? (
                                    <FirecapeSquare className="hover:ring-2 hover:ring-white transition-all cursor-pointer" />
                                  ) : (
                                    <div
                                      className={`w-[11px] h-[11px] rounded-sm ${getActivityColor(
                                        day.count,
                                        day.totalSeconds
                                      )} hover:ring-2 hover:ring-white transition-all cursor-pointer`}
                                    />
                                  )}
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
                    <div className="flex gap-0.5 items-center">
                      <div className="w-[8px] h-[8px] rounded-sm bg-gray-800"></div>
                      <div className="w-[8px] h-[8px] rounded-sm bg-[#FFAA00]/20"></div>
                      <div className="w-[8px] h-[8px] rounded-sm bg-[#FFAA00]/40"></div>
                      <div className="w-[8px] h-[8px] rounded-sm bg-[#FFAA00]/70"></div>
                      <div className="w-[8px] h-[8px] rounded-sm bg-[#FFAA00]"></div>
                      <FirecapeSquare className="w-[8px] h-[8px]" />
                    </div>
                    {colorByTime ? (
                      <span className="text-gray-500">any | 30m | 1-5h | 5-10h | 10h+</span>
                    ) : (
                      <span className="text-gray-500">1 | 3-4 | 5-9 | 10-19 | 20+</span>
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
                  Calculated from {isViewingOtherUser ? "their" : "your"} first task on {firstTaskDate.toLocaleDateString("en-US", { timeZone: displayTimezone || undefined })}
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
