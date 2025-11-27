/**
 * OrderService 时间处理工具
 * 现已迁移到 timeConfig.ts，此文件保留向后兼容
 */

import {
  getFullDayTimeRange as getFullDayTimeRangeConfig,
  getTimeRangeAroundNow as getTimeRangeAroundNowConfig,
  getNextSevenDaysRange as getNextSevenDaysRangeConfig,
} from './timeConfig';

/**
 * 获取悉尼当天完整时间范围（转换为UTC+0时区）
 * @deprecated 使用 timeConfig.getFullDayTimeRange() 代替
 */
export const getFullDayTimeRange = (): [string, string] => {
  return getFullDayTimeRangeConfig();
};

/**
 * 返回从当前时间30秒前到当天结束的时间范围（转换为UTC+0时区）
 * @deprecated 使用 timeConfig.getTimeRangeAroundNow() 代替
 */
export const getTimeRangeAroundNow = (): [string, string] => {
  return getTimeRangeAroundNowConfig();
};

/**
 * 获取未来7天的时间范围
 * @deprecated 使用 timeConfig.getNextSevenDaysRange() 代替
 */
export const getNextSevenDaysRange = (): [string, string] => {
  return getNextSevenDaysRangeConfig();
}; 