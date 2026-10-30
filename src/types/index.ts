export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  createdAt?: string;
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
}

export interface NotificationItem {
  id: string;
  type: 'online' | 'offline' | 'system';
  title: string;
  message: string;
  timestamp: string;
  userId?: string;
}
