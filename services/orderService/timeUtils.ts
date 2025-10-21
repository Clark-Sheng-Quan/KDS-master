/**
 * OrderService 时间处理工具
 */

/**
 * 获取悉尼当天完整时间范围（转换为UTC+0时区）
 */
export const getFullDayTimeRange = (): [string, string] => {
  // 获取当前悉尼时间
  const now = new Date();
  
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0); 
  
  // 计算今天结束时间（悉尼时间 23:59:59）
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  
  // 格式化为服务器期望的日期格式 "YYYY-MM-DD HH:MM:SS"（UTC时间）
  const formatDate = (date: Date) => {
    // 创建UTC时间字符串
    const utcYear = date.getUTCFullYear();
    const utcMonth = String(date.getUTCMonth() + 1).padStart(2, '0');
    const utcDay = String(date.getUTCDate()).padStart(2, '0');
    const utcHours = String(date.getUTCHours()).padStart(2, '0');
    const utcMinutes = String(date.getUTCMinutes()).padStart(2, '0');
    const utcSeconds = String(date.getUTCSeconds()).padStart(2, '0');
    
    return `${utcYear}-${utcMonth}-${utcDay} ${utcHours}:${utcMinutes}:${utcSeconds}`;
  };
  
  // 返回UTC格式的时间范围（服务器时区）
  return [formatDate(todayStart), formatDate(todayEnd)];
};

/**
 * 返回从当前时间5秒前到当天结束的时间范围（转换为UTC+0时区）
 */
export const getTimeRangeAroundNow = (): [string, string] => {
  // 获取当前悉尼时间
  const now = new Date();
  
  // 计算5秒前（悉尼时间）
  const fiveSecondsAgo = new Date(now.getTime() - 30000);
  
  // 计算今天结束时间（悉尼时间 23:59:59）
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  
  // 格式化为服务器期望的日期格式 "YYYY-MM-DD HH:MM:SS"（UTC时间）
  const formatDate = (date: Date) => {
    // 创建UTC时间字符串
    const utcYear = date.getUTCFullYear();
    const utcMonth = String(date.getUTCMonth() + 1).padStart(2, '0');
    const utcDay = String(date.getUTCDate()).padStart(2, '0');
    const utcHours = String(date.getUTCHours()).padStart(2, '0');
    const utcMinutes = String(date.getUTCMinutes()).padStart(2, '0');
    const utcSeconds = String(date.getUTCSeconds()).padStart(2, '0');
    
    return `${utcYear}-${utcMonth}-${utcDay} ${utcHours}:${utcMinutes}:${utcSeconds}`;
  };
  
  // 返回UTC格式的时间范围（服务器时区）
  return [formatDate(fiveSecondsAgo), formatDate(todayEnd)];
}; 

// 获取未来7天的时间范围
export const getNextSevenDaysRange = (): [string, string] => {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setHours(0, 0, 0, 0);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const sevenDaysLater = new Date(tomorrow);
  sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
  sevenDaysLater.setHours(23, 59, 59, 999);

  return [tomorrow.toISOString(), sevenDaysLater.toISOString()];
}; 