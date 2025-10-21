import { NativeEventEmitter, NativeModules } from 'react-native';

export const EventEmitter = new NativeEventEmitter(NativeModules.EventEmitter); 