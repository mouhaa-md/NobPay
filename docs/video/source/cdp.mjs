// Tiny DevTools-protocol driver for a headless Edge (Node 24, global WebSocket).
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const EDGE = process.env.EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Tab {
  static async open({ port, width = 390, height = 844, scale = 1, mobile = false, base = '' }) {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'nb-edge-'));
    const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, `--window-size=${width},${height}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
    let page;
    for (let i = 0; i < 80 && !page; i++) {
      try {
        const j = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
        page = j.find((t) => t.type === 'page');
      } catch {
        /* not up yet */
      }
      if (!page) await sleep(300);
    }
    if (!page) throw new Error('no page target');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', rej, { once: true });
    });
    const t = new Tab(proc, ws, base);
    for (const d of ['Page', 'Runtime', 'DOM']) await t.send(`${d}.enable`);
    await t.setDevice(width, height, scale, mobile);
    return t;
  }

  constructor(proc, ws, base) {
    this.proc = proc;
    this.ws = ws;
    this.base = base;
    this.id = 0;
    this.pending = new Map();
    this.errors = [];
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { res, rej } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? rej(new Error(m.error.message)) : res(m.result);
      } else if (m.method === 'Runtime.exceptionThrown') this.errors.push('EXC ' + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text));
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async setDevice(width, height, scale = 1, mobile = false) {
    await this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile });
    await this.send('Emulation.setTouchEmulationEnabled', { enabled: mobile });
  }

  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
    return r.result.value;
  }

  async go(url, settle = 1200) {
    await this.send('Page.navigate', { url: /^(https?|file):/.test(url) ? url : this.base + url });
    for (let i = 0; i < 80; i++) {
      await sleep(200);
      if ((await this.eval('document.readyState')) === 'complete') break;
    }
    await sleep(settle);
  }

  async waitFor(expr, timeout = 10000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      try {
        const v = await this.eval(expr);
        if (v) return v;
      } catch {
        /* retry */
      }
      await sleep(250);
    }
    return false;
  }

  has(text) {
    return this.eval(`document.body.innerText.includes(${JSON.stringify(text)})`);
  }

  setValue(sel, value) {
    return this.eval(`(function(){const el=document.querySelector(${JSON.stringify(sel)}); if(!el) return 'missing'; const set=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value').set; set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return 'ok'})()`);
  }

  click(sel) {
    return this.eval(`(function(){const el=document.querySelector(${JSON.stringify(sel)}); if(!el) return 'missing'; el.click(); return 'ok'})()`);
  }

  clickText(text, tag = 'button') {
    return this.eval(`(function(){const els=[...document.querySelectorAll(${JSON.stringify(tag)})]; const el=els.find(e=>e.textContent.replace(/\\s+/g,' ').includes(${JSON.stringify(text)})); if(!el) return 'missing'; el.click(); return 'ok'})()`);
  }

  async upload(sel, files) {
    const doc = await this.send('DOM.getDocument', { depth: 0 });
    const q = await this.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: sel });
    if (!q.nodeId) return 'missing';
    await this.send('DOM.setFileInputFiles', { nodeId: q.nodeId, files });
    return 'ok';
  }

  async geo(origin, latitude, longitude, accuracy = 12) {
    await this.send('Browser.grantPermissions', { permissions: ['geolocation'], origin });
    await this.send('Emulation.setGeolocationOverride', { latitude, longitude, accuracy });
  }

  /** viewport screenshot, or the whole page (up to 7000 css px) when full=true */
  async shot(file, { full = false, format = 'png', quality = 90 } = {}) {
    mkdirSync(path.dirname(file), { recursive: true });
    const p = { format, quality };
    if (full) {
      const m = JSON.parse(await this.eval('JSON.stringify({w: document.documentElement.scrollWidth, h: Math.min(document.documentElement.scrollHeight, 7000)})'));
      Object.assign(p, { captureBeyondViewport: true, clip: { x: 0, y: 0, width: m.w, height: m.h, scale: 1 } });
    }
    const r = await this.send('Page.captureScreenshot', p);
    writeFileSync(file, Buffer.from(r.data, 'base64'));
    return file;
  }

  close() {
    try {
      this.ws.close();
    } catch {
      /* ignore */
    }
    try {
      this.proc.kill();
    } catch {
      /* ignore */
    }
  }
}
