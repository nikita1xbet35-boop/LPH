export class ChatRoom {
  private sessions = new Map<string, WebSocket>();
  private pingIntervals = new Map<string, ReturnType<typeof setInterval>>();

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Внутренний broadcast от REST endpoint
    if (url.pathname === '/broadcast' && request.method === 'POST') {
      const payload = await request.json() as { type: string; data: unknown; excludeUserId?: string };
      const msg = JSON.stringify({ type: payload.type, data: payload.data });
      for (const [userId, ws] of this.sessions) {
        if (payload.excludeUserId && userId === payload.excludeUserId) continue;
        try { ws.send(msg); } catch { this.removeSession(userId); }
      }
      return new Response('ok');
    }

    // WebSocket upgrade
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    const userId = url.searchParams.get('user_id');
    if (!userId) return new Response('user_id required', { status: 400 });

    const { 0: client, 1: server } = new WebSocketPair();
    server.accept();

    // Уведомляем о присутствии
    this.broadcast({ type: 'presence', data: { user_id: userId, online: true } }, userId);

    this.sessions.set(userId, server);

    // Keepalive ping каждые 30 сек
    const pingInterval = setInterval(() => {
      try { server.send(JSON.stringify({ type: 'ping' })); } catch { this.removeSession(userId); }
    }, 30_000);
    this.pingIntervals.set(userId, pingInterval);

    server.addEventListener('message', (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as { type: string };
        if (msg.type === 'ping') {
          server.send(JSON.stringify({ type: 'pong' }));
        } else if (msg.type === 'typing') {
          this.broadcast({ type: 'typing', data: { user_id: userId } }, userId);
        }
      } catch { /* игнорируем неверный формат */ }
    });

    server.addEventListener('close', () => this.removeSession(userId));
    server.addEventListener('error', () => this.removeSession(userId));

    return new Response(null, { status: 101, webSocket: client });
  }

  private removeSession(userId: string): void {
    this.sessions.delete(userId);
    const interval = this.pingIntervals.get(userId);
    if (interval) { clearInterval(interval); this.pingIntervals.delete(userId); }
    this.broadcast({ type: 'presence', data: { user_id: userId, online: false } });
  }

  private broadcast(payload: { type: string; data: unknown }, excludeUserId?: string): void {
    const msg = JSON.stringify(payload);
    for (const [uid, ws] of this.sessions) {
      if (excludeUserId && uid === excludeUserId) continue;
      try { ws.send(msg); } catch { this.removeSession(uid); }
    }
  }
}
