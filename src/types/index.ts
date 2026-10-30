export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  createdAt?: string;
}

export interface LocationData {
  lat: number;
  lng: number;
  city?: string;
  country?: string;
  region?: string;
  ip?: string;
  accuracy?: number;
  updatedAt?: string;
}

export interface TelemetryData {
  latencyMs: number;
  packetLossPercent: number;
  fps: number;
  resolution: string;
  bitrateKbps: number;
  networkQuality: 'excellent' | 'good' | 'fair' | 'poor';
  updatedAt?: string;
}

export interface StreamSettings {
  resolution: '1080p' | '720p' | '480p' | '360p';
  fps: 15 | 30 | 60;
  bitrateKbps: number;
}

export interface OnlineUser {
  userId: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  facingMode: 'user' | 'environment';
  isStreaming: boolean;
  connectedAt: string;
  lastFrame?: string;
  lastFrameTimestamp?: string;
  location?: LocationData;
  telemetry?: TelemetryData;
  streamSettings?: StreamSettings;
  orientation?: 'portrait' | 'landscape';
  orientationAngle?: number;
  lastOrientationChange?: string;
}

export interface NotificationItem {
  id: string;
  type: 'online' | 'offline' | 'system';
  title: string;
  message: string;
  timestamp: string;
  userId?: string;
}

