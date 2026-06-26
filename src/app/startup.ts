/** Parsed startup configuration from URL parameters. */
export interface StartupRequest {
  ws: string;
  speed: number;
  autoplay: boolean;
  demo: boolean;
}

/** Validated startup configuration ready for app initialization. */
export interface StartupResponse {
  wsUrl: string;
  speed: number;
  autoplay: boolean;
  demo: boolean;
  isValid: boolean;
  errors: string[];
}

const DEFAULT_WS = 'ws://localhost:8080/stream';
const DEFAULT_SPEED = 8; // events per tick

/** Parse URL search params into a validated startup response. */
export function parseStartup(search: string): StartupResponse {
  const params = new URLSearchParams(search);
  const errors: string[] = [];

  const wsUrl = params.get('ws') ?? DEFAULT_WS;
  if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
    errors.push(`Invalid WebSocket URL: ${wsUrl}`);
  }

  const speedRaw = params.get('speed');
  let speed = DEFAULT_SPEED;
  if (speedRaw !== null) {
    const parsed = Number(speedRaw);
    if (isNaN(parsed) || parsed < 1 || parsed > 100) {
      errors.push(`Invalid speed: ${speedRaw} (must be 1-100)`);
    } else {
      speed = parsed;
    }
  }

  const autoplay = params.get('autoplay') === '1';
  const demo = params.has('demo');

  return {
    wsUrl,
    speed,
    autoplay,
    demo,
    isValid: errors.length === 0,
    errors,
  };
}
