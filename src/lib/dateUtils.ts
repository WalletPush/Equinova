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
 *
 * UK racing runs ~10 AM to 9:30 PM. Times stored as:
 *   01:XX-09:XX  → PM times (1 PM-9 PM), need +12
 *   10:XX-12:XX  → genuine morning/noon (10 AM, 11 AM, 12 PM), keep as-is
 *   13:XX+       → already 24h, keep as-is
 */
export function formatTime(timeString: string): string {
  if (!timeString) return '';
  
  // Extract time part (remove seconds if present)
  const timePart = timeString.substring(0, 5);
  const [hours, minutes] = timePart.split(':').map(Number);
  
  // Only hours 1-9 are PM times stored without the PM indicator
  if (hours >= 1 && hours <= 9) {
    const pmHours = hours + 12;
    return `${pmHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }
  
  // 10:XX = 10 AM, 11:XX = 11 AM, 12:XX = 12 PM, 13:XX+ = already correct
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
  
  // Convert race time from stored format to real 24h (only 01:XX-09:XX are PM)
  let adjustedRaceHour = raceHour;
  if (raceHour >= 1 && raceHour <= 9) {
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
  
  // Convert race time from stored format to real 24h (only 01:XX-09:XX are PM)
  let adjustedRaceHour = raceHour;
  if (raceHour >= 1 && raceHour <= 9) {
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
 * minutes-since-midnight value. Only hours 01-09 are PM (13-21).
 * Hours 10-12 are genuine morning/noon and stay as-is.
 */
export function raceTimeToMinutes(offTime: string): number {
  if (!offTime) return 0
  const [h, m] = offTime.substring(0, 5).split(':').map(Number)
  const adjusted = h >= 1 && h <= 9 ? h + 12 : h
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