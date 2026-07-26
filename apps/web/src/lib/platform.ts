import { Capacitor } from '@capacitor/core';

/** True when running inside a Capacitor native WebView (iOS / Android). */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/** Capacitor platform string: 'ios' | 'android' | 'web'. */
export function platformName(): string {
  return Capacitor.getPlatform();
}
