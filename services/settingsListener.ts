import { EventEmitter } from 'events';

class SettingsListener {
  private emitter: EventEmitter;

  constructor() {
    this.emitter = new EventEmitter();
    // 设置最大监听数为 0（无限制）
    this.emitter.setMaxListeners(0);
  }

  // 监听设置变化
  onSettingChange(key: string, callback: (value: any) => void) {
    this.emitter.on(`setting:${key}`, callback);
  }

  // 移除监听
  offSettingChange(key: string, callback: (value: any) => void) {
    this.emitter.off(`setting:${key}`, callback);
  }

  // 触发设置变化事件
  emitSettingChange(key: string, value: any) {
    this.emitter.emit(`setting:${key}`, value);
  }

  // 清空所有监听
  removeAllListeners() {
    this.emitter.removeAllListeners();
  }
}

export const settingsListener = new SettingsListener();
