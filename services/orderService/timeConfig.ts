/**
 * 统一时间配置
 * 用于获取本地时区和统一的时间处理
 */

import { DateTime } from 'luxon';

/**
 * 获取设备本地时区
 * 如果获取失败，默认使用 Australia/Sydney
 */
export const getLocalTimezone = (): string => {
  try {
    // 获取本地时区 (e.g., "Australia/Sydney", "America/New_York")
    const localTz = DateTime.now().zoneName;
    return localTz || 'Australia/Sydney';
  } catch (error) {
    console.warn('[TimeConfig] Failed to get local timezone, using Sydney as fallback');
    return 'Australia/Sydney';
  }
};

/**
 * 获取当前本地时间（UTC毫秒数）
 */
export const getCurrentTimeMs = (): number => {
  return DateTime.now().toMillis();
};

/**
 * 获取当前本地时间（ISO字符串）
 */
export const getCurrentTimeISO = (): string => {
  return new Date().toISOString();
};

/**
 * 获取当前本地时间（格式化字符串）
 */
export const getCurrentTimeFormatted = (format: string = 'yyyy-MM-dd HH:mm:ss'): string => {
  return DateTime.now().toFormat(format);
};

/**
 * 将 UTC 时间字符串转换为本地时区格式化字符串
 */
export const convertToLocalTime = (
  utcTimeString: string,
  format: string = 'yyyy-MM-dd HH:mm:ss'
): string => {
  try {
    const localTz = getLocalTimezone();
    let utcDate: DateTime;
    const trimmedString = utcTimeString.trim();
    
    // Try to parse as ISO format first
    utcDate = DateTime.fromISO(trimmedString, { zone: 'utc' });
    if (utcDate.isValid) {
      const localDate = utcDate.setZone(localTz);
      return localDate.toFormat(format);
    }
    
    // Check if string contains timezone offset
    const timezoneOffsetMatch = trimmedString.match(/^(.+)\s+([+-]\d{4})$/);
    
    if (timezoneOffsetMatch) {
      const dateTimePart = timezoneOffsetMatch[1];
      const offsetPart = timezoneOffsetMatch[2];
      const isoString = dateTimePart.replace(' ', 'T') + offsetPart.slice(0, 3) + ':' + offsetPart.slice(3);
      utcDate = DateTime.fromISO(isoString);
    } else if (trimmedString.match(/^[A-Za-z]{3}\s+\d{1,2},\s+\d{4}\s+\d{1,2}:\d{2}:\d{2}\s+(AM|PM)$/i)) {
      // POS Format: "Oct 30, 2025 10:44:43 PM"
      utcDate = DateTime.fromFormat(trimmedString, 'MMM d, yyyy h:mm:ss a', { zone: 'utc', locale: 'en-US' });
    } else {
      // Format: "2025-10-29 00:00:00" (assume UTC)
      utcDate = DateTime.fromFormat(trimmedString, 'yyyy-MM-dd HH:mm:ss', { zone: 'utc' });
    }

    if (!utcDate.isValid) {
      console.error('[TimeConfig] Time parsing failed:', utcDate.invalidExplanation);
      return utcTimeString;
    }

    const localDate = utcDate.setZone(localTz);
    return localDate.toFormat(format);
  } catch (error) {
    console.error('[TimeConfig] Timezone conversion error:', error);
    return utcTimeString;
  }
};

/**
 * 获取当天完整时间范围（用于API查询）
 * @returns [startTime, endTime] UTC格式字符串
 */
export const getFullDayTimeRange = (): [string, string] => {
  const now = DateTime.now().toUTC();
  
  const todayStart = now.startOf('day');
  const todayEnd = now.endOf('day');
  
  const formatDate = (date: DateTime) => {
    const year = date.year;
    const month = String(date.month).padStart(2, '0');
    const day = String(date.day).padStart(2, '0');
    const hours = String(date.hour).padStart(2, '0');
    const minutes = String(date.minute).padStart(2, '0');
    const seconds = String(date.second).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  };
  
  return [formatDate(todayStart), formatDate(todayEnd)];
};

/**
 * 获取从当前时间30秒前到当天结束的时间范围
 * @returns [startTime, endTime] UTC格式字符串
 */
export const getTimeRangeAroundNow = (): [string, string] => {
  const now = DateTime.now().toUTC();
  const thirtySecondsAgo = now.minus({ seconds: 30 });
  const todayEnd = now.endOf('day');
  
  const formatDate = (date: DateTime) => {
    const year = date.year;
    const month = String(date.month).padStart(2, '0');
    const day = String(date.day).padStart(2, '0');
    const hours = String(date.hour).padStart(2, '0');
    const minutes = String(date.minute).padStart(2, '0');
    const seconds = String(date.second).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  };
  
  return [formatDate(thirtySecondsAgo), formatDate(todayEnd)];
};

/**
 * 获取未来7天的时间范围
 * @returns [startTime, endTime] ISO格式字符串
 */
export const getNextSevenDaysRange = (): [string, string] => {
  const now = DateTime.now().toUTC();
  const tomorrow = now.plus({ days: 1 }).startOf('day');
  const sevenDaysLater = tomorrow.plus({ days: 7 }).endOf('day');
  
  return [tomorrow.toISO() || '', sevenDaysLater.toISO() || ''];
};
