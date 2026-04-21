/**
 * Socket.IO mocking helper (epic #537 / sub-issue #541).
 *
 * Adapted from the inline implementation in `setup-wizard.spec.ts`.
 *
 * Installs an init script that intercepts only Socket.IO `WebSocket`
 * connections (URLs containing `/socket.io/`) and replays the EIO4 handshake.
 * Non-Socket.IO connections (e.g. Next.js HMR) pass through to the real
 * browser `WebSocket` so the dev server keeps working.
 *
 * Tests trigger fake server-side events via `emitSocketEvent(page, event, data)`.
 */
import type { Page } from "@playwright/test";

export async function stubSocket(page: Page): Promise<void> {
  await page.addInitScript(`
    (function () {
      var OriginalWS = window.WebSocket;
      var listeners = { open: [], message: [], close: [], error: [] };
      var _onopen = null, _onmessage = null, _onclose = null, _onerror = null;

      function fire(type, evt) {
        var direct = { open: _onopen, message: _onmessage, close: _onclose, error: _onerror }[type];
        if (direct) direct.call(null, evt);
        (listeners[type] || []).forEach(function(h) {
          typeof h === 'function' ? h(evt) : h.handleEvent(evt);
        });
      }

      var mockWS = {
        readyState: 1, url: '', protocol: '', bufferedAmount: 0, binaryType: 'arraybuffer',
        get onopen() { return _onopen; }, set onopen(h) { _onopen = h; },
        get onmessage() { return _onmessage; }, set onmessage(h) { _onmessage = h; },
        get onclose() { return _onclose; }, set onclose(h) { _onclose = h; },
        get onerror() { return _onerror; }, set onerror(h) { _onerror = h; },
        addEventListener: function(t, h) { (listeners[t] = listeners[t] || []).push(h); },
        removeEventListener: function(t, h) {
          listeners[t] = (listeners[t] || []).filter(function(x) { return x !== h; });
        },
        send: function(payload) {
          // Capture client-emitted events for assertion.
          window.__sentSocketMessages = window.__sentSocketMessages || [];
          window.__sentSocketMessages.push(payload);
        },
        close: function() { mockWS.readyState = 3; },
        _receiveEvent: function(event, data) {
          var msg = new MessageEvent('message', { data: '42' + JSON.stringify([event, data]) });
          fire('message', msg);
        }
      };

      function MockWS(url) {
        if (!url || !url.includes('/socket.io/')) {
          return new OriginalWS(url);
        }
        mockWS.readyState = 1;
        mockWS.url = url;
        window.__mockWS = mockWS;

        setTimeout(function() { fire('open', new Event('open')); }, 10);
        setTimeout(function() {
          fire('message', new MessageEvent('message', {
            data: '0{"sid":"e2e","upgrades":[],"pingInterval":25000,"pingTimeout":5000,"maxPayload":1000000}'
          }));
          fire('message', new MessageEvent('message', { data: '40{"sid":"e2e"}' }));
        }, 20);

        return mockWS;
      }
      MockWS.CONNECTING = 0; MockWS.OPEN = 1; MockWS.CLOSING = 2; MockWS.CLOSED = 3;
      MockWS.prototype = {};

      window.WebSocket = MockWS;
      window.__emitSocketEvent = function(event, data) {
        if (window.__mockWS) window.__mockWS._receiveEvent(event, data);
      };
    })();
  `);
}

/**
 * Trigger a fake server → client Socket.IO event from Node test code into the
 * browser. Must be preceded by `stubSocket(page)`.
 */
export async function emitSocketEvent(page: Page, event: string, data: unknown): Promise<void> {
  await page.evaluate(
    ({ ev, payload }) => {
      (window as Window & { __emitSocketEvent?: (e: string, d: unknown) => void }).__emitSocketEvent?.(ev, payload);
    },
    { ev: event, payload: data }
  );
}

/**
 * Emit a sequence of events with optional inter-event delay. Useful for
 * driving the Workbench pipeline (`discovery:start` → `discovery:progress` →
 * `discovery:complete` → ...).
 */
export async function emitSocketSequence(
  page: Page,
  events: Array<{ event: string; data: unknown; delayMs?: number }>
): Promise<void> {
  for (const { event, data, delayMs = 0 } of events) {
    await emitSocketEvent(page, event, data);
    if (delayMs > 0) {
      await page.waitForTimeout(delayMs);
    }
  }
}
