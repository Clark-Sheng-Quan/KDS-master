import { NativeEventEmitter, NativeModules } from 'react-native';
import { EventEmitter as NodeEventEmitter } from 'events';

export const EventEmitter = new NativeEventEmitter(NativeModules.EventEmitter); 

// 创建应用级事件发射器，用于应用内部事件通信
export const AppEventEmitter = new NodeEventEmitter();

// 应用事件类型
export const APP_EVENTS = {
  ITEM_LEVEL_COMPLETION_CHANGED: 'ITEM_LEVEL_COMPLETION_CHANGED',
};
