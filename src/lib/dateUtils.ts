/**
 * UK Timezone Date Utilities
 * Provides consistent date handling across the application using UK London timezone
 */

/**
 * Get current date in UK timezone (YYYY-MM-DD format)
 */
export function getUKDate(): string {
  const now = new Date();
  return now.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
}

/**
 * Get current time in UK timezone (HH:MM format)
 */
export function getUKTime(): string {
  const now = new Date();
  return now.toLocaleTimeString('en-GB', { 
    timeZone: 'Europe/London',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Get current date and time in UK timezone
 */
export function getUKDateTime(): { date: string; time: string; dateTime: string } {
  const date = getUKDate();
  const time = getUKTime();
  return {
    date,
    time,
    dateTime: `${date} ${time}`
  };
}

/**
 * Format a time string (HH:MM) for display
 * Converts incorrectly stored AM times to proper PM times for race display
 */
export function formatTime(timeString: string): string {
  if (!timeString) return '';
  
  // Extract time part (remove seconds if present)
  const timePart = timeString.substring(0, 5);
  const [hours, minutes] = timePart.split(':').map(Number);
  
  // Race times stored as 01:XX, 02:XX, etc. should be PM times (13:XX, 14:XX)
  // Convert early hours (01:00 - 11:59) to PM equivalent for race display
  if (hours >= 1 && hours <= 11) {
    const pmHours = hours + 12;
    return `${pmHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }
  
  // 12:XX stays as 12:XX (noon hour)
  // Other times (00:XX, 13:XX+) return as-is
  return timePart;
}

/**
 * Check if a race time has passed (considering UK timezone)
 * Converts AM format to PM for race times before comparison
 */
export function isRaceCompleted(raceTime: string, bufferMinutes: number = 120): boolean {
  if (!raceTime) return false;
  
  const currentTime = getUKTime();
  const [raceHour, raceMinute] = raceTime.split(':').map(Number);
  const [currentHour, currentMinute] = currentTime.split(':').map(Number);
  
  // Convert race time from AM format to PM (add 12 hours for 01:XX - 11:XX)
  let adjustedRaceHour = raceHour;
  if (raceHour >= 1 && raceHour <= 11) {
    adjustedRaceHour = raceHour + 12;
  }
  
  const raceTimeMinutes = adjustedRaceHour * 60 + raceMinute;
  const currentTimeMinutes = currentHour * 60 + currentMinute;
  
  // Race is completed if it started more than bufferMinutes ago
  return (currentTimeMinutes - raceTimeMinutes) >= bufferMinutes;
}

/**
 * Check if a race is upcoming (considering UK timezone)
 * Converts AM format to PM for race times before comparison
 */
export function isRaceUpcoming(raceTime: string): boolean {
  if (!raceTime) return false;
  
  const currentTime = getUKTime();
  const [raceHour, raceMinute] = raceTime.split(':').map(Number);
  const [currentHour, currentMinute] = currentTime.split(':').map(Number);
  
  // Convert race time from AM format to PM (add 12 hours for 01:XX - 11:XX)
  let adjustedRaceHour = raceHour;
  if (raceHour >= 1 && raceHour <= 11) {
    adjustedRaceHour = raceHour + 12;
  }
  
  const raceTimeMinutes = adjustedRaceHour * 60 + raceMinute;
  const currentTimeMinutes = currentHour * 60 + currentMinute;
  
  return raceTimeMinutes > currentTimeMinutes;
}

/**
 * Get display label for date status
 */
export function getDateStatusLabel(): string {
  const { date, time } = getUKDateTime();
  return `London: ${date} ${time}`;
}

/**
 * Format date for React Query cache keys (ensures consistent caching)
 */
export function getQueryDateKey(): string {
  return getUKDate();
}

/**
 * Convert a stored off_time string (e.g. "01:30", "12:00") to a sortable
 * minutes-since-midnight value. Hours 01-11 are treated as PM (13-23).
 */
export function raceTimeToMinutes(offTime: string): number {
  if (!offTime) return 0
  const [h, m] = offTime.substring(0, 5).split(':').map(Number)
  const adjusted = h >= 1 && h <= 11 ? h + 12 : h
  return adjusted * 60 + (m || 0)
}

/**
 * Compare two off_time strings chronologically.
 * Handles the AM storage quirk (01:00 = 1 PM).
 * Usage: array.sort((a, b) => compareRaceTimes(a.off_time, b.off_time))
 */
export function compareRaceTimes(a: string, b: string): number {
  return raceTimeToMinutes(a) - raceTimeToMinutes(b)
}