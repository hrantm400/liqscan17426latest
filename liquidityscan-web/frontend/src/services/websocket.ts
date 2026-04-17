import { io, Socket } from 'socket.io-client';
import { getStoredAccessToken } from './userApi';

class WebSocketService {
  private socket: Socket | null = null;
  private listeners: Map<string, Set<Function>> = new Map();
  private isConnecting = false;

  constructor() {
    // Lazy connect: only connect when first subscription is requested.
  }

  private connect() {
    if (this.socket || this.isConnecting) return;
    this.isConnecting = true;

    // We'll use the same URL resolution logic as API calls, or let socket.io figure it out
    const apiUrl = import.meta.env.VITE_API_URL || '';

    // Create socket connection
    this.socket = io(apiUrl || undefined, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      autoConnect: false,
      reconnection: true,
      auth: (cb) => {
        cb({ token: getStoredAccessToken() || '' });
      },
    });

    this.socket.connect();

    this.socket.on('connect', () => {
      this.isConnecting = false;
    });

    this.socket.on('disconnect', () => {});

    this.socket.on('connect_error', () => {
      this.isConnecting = false;
    });

    // Generic event handler to dispatch to our listeners
    this.socket.onAny((event, ...args) => {
      const callbacks = this.listeners.get(event);
      if (callbacks) {
        callbacks.forEach(callback => callback(...args));
      }
    });
  }

  public subscribeToSymbol(symbol: string, timeframe: string) {
    if (!this.socket) this.connect();

    this.socket?.emit('subscribe:symbol', { symbol, timeframe });
  }

  public unsubscribeFromSymbol(symbol: string, timeframe: string) {
    this.socket?.emit('unsubscribe:symbol', { symbol, timeframe });
  }

  public on(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)?.add(callback);
  }

  public off(event: string, callback: Function) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  public disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnecting = false;
    }
  }
}

export const wsService = new WebSocketService();
