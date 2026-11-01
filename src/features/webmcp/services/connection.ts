import { webMcpTools } from './tools';

export function webMcpServer(value: string) {
  const server = new URL(value);
  if (
    !['ws:', 'wss:'].includes(server.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(server.hostname) ||
    server.username ||
    server.password ||
    server.search ||
    server.hash ||
    server.pathname !== '/'
  )
    throw new Error('WebMCP requires a local ws:// or wss:// bridge.');
  return server.origin;
}

/** Wire protocol used by webmcp.dev / @jason.today/webmcp, independent of the native API. */
export function parseWebMcpToken(encoded: string) {
  const data = JSON.parse(atob(encoded.trim()));
  if (!data || typeof data.server !== 'string' || typeof data.token !== 'string' || !data.token)
    throw new Error('Invalid WebMCP token.');
  return { server: webMcpServer(data.server), token: data.token };
}

export const BRIDGE_IDLE_MS = 5 * 60 * 1000;
export interface BridgeCredentials {
  server: string;
  token: string;
  host: string;
  expiresAt: number;
}

export class WebMcpConnection {
  private socket: WebSocket | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;
  private credentials: BridgeCredentials | null = null;

  constructor(
    private execute: (name: string, args: unknown) => unknown,
    private status: (message: string) => void,
    private onSession: (credentials: BridgeCredentials | null) => void = () => {},
  ) {}

  connect(encoded: string) {
    const data = parseWebMcpToken(encoded);
    if (this.stopped || this.socket) throw new Error('Start a new connection.');
    const host = window.location.host.replace(/[.:]/g, '_');
    this.status('Connecting…');
    const registration = new WebSocket(`${data.server}/register`);
    this.socket = registration;
    this.armTimeout(15000, 'Connection timed out.');
    registration.onopen = () => {
      if (!this.stopped) registration.send(btoa(JSON.stringify({ ...data, host })));
    };
    registration.onerror = () => this.disconnect('Could not connect to the local WebMCP bridge.');
    registration.onclose = () => {
      if (this.socket === registration)
        this.disconnect('Registration closed. Generate a new token.');
    };
    registration.onmessage = (event) => {
      if (this.stopped || this.socket !== registration) return;
      try {
        const message = JSON.parse(event.data);
        if (
          message.type !== 'registerSuccess' ||
          typeof message.token !== 'string' ||
          !message.token
        )
          throw new Error('Registration failed. Generate a new token.');
        registration.onclose = null;
        registration.close();
        this.openChannel({
          server: data.server,
          host,
          token: message.token,
          expiresAt: Date.now() + BRIDGE_IDLE_MS,
        });
      } catch {
        this.disconnect('Registration failed. Generate a new token.');
      }
    };
  }

  resume(credentials: BridgeCredentials) {
    if (this.stopped || this.socket) throw new Error('Start a new connection.');
    if (
      credentials.host !== window.location.host.replace(/[.:]/g, '_') ||
      typeof credentials.token !== 'string' ||
      !credentials.token ||
      !Number.isFinite(credentials.expiresAt) ||
      credentials.expiresAt <= Date.now()
    )
      throw new Error('Session expired. Generate a new token.');
    this.openChannel({ ...credentials, server: webMcpServer(credentials.server) });
  }

  private openChannel(credentials: BridgeCredentials) {
    this.credentials = credentials;
    this.status('Connecting…');
    const socket = new WebSocket(
      `${credentials.server}/${credentials.host}?token=${encodeURIComponent(credentials.token)}`,
    );
    this.socket = socket;
    this.armTimeout(15000, 'Connection timed out.');
    socket.onopen = () => {
      if (this.stopped || this.socket !== socket) return;
      this.status('Connected');
      this.rememberActivity();
      for (const tool of webMcpTools) this.send({ type: 'registerTool', ...tool });
    };
    socket.onerror = () => this.disconnect('WebMCP connection failed. Generate a new token.');
    socket.onclose = () => this.disconnect('Disconnected');
    socket.onmessage = (event) => this.receive(event.data);
  }

  private rememberActivity() {
    if (this.credentials) {
      this.credentials = { ...this.credentials, expiresAt: Date.now() + BRIDGE_IDLE_MS };
      this.onSession(this.credentials);
    }
    this.armTimeout(BRIDGE_IDLE_MS, 'Disconnected after five minutes without tool activity.');
  }

  private send(message: unknown) {
    if (!this.stopped && this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify(message));
  }

  private async receive(raw: string) {
    if (this.stopped) return;
    try {
      const message = JSON.parse(raw);
      const id = message.id;
      switch (message.type) {
        case 'ping':
          this.send({ type: 'pong', id, timestamp: Date.now() });
          break;
        case 'listTools':
          this.send({ type: 'listToolsResponse', id, tools: webMcpTools });
          break;
        case 'listPrompts':
          this.send({ type: 'listPromptsResponse', id, prompts: [] });
          break;
        case 'listResources':
          this.send({ type: 'listResourcesResponse', id, resources: [], resourceTemplates: [] });
          break;
        case 'callTool':
          this.rememberActivity();
          try {
            const result = await this.execute(message.tool, message.arguments);
            this.send({ type: 'toolResponse', id, result });
          } catch (error) {
            this.send({
              type: 'toolResponse',
              id,
              error: error instanceof Error ? error.message : 'Tool failed.',
            });
          }
          break;
      }
    } catch {
      this.disconnect('Invalid message from the WebMCP bridge.');
    }
  }

  private armTimeout(delay: number, message: string) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.disconnect(message), delay);
  }

  disconnect(message = 'Disconnected', { preserveSession = false } = {}) {
    if (this.stopped) return;
    this.stopped = true;
    clearTimeout(this.timer);
    if (this.socket) {
      this.socket.onopen = this.socket.onmessage = this.socket.onerror = this.socket.onclose = null;
      this.socket.close();
      this.socket = null;
    }
    this.credentials = null;
    if (!preserveSession) this.onSession(null);
    this.status(message);
  }
}
