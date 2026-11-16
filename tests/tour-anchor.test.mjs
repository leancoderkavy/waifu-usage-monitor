import test from 'node:test';
import assert from 'node:assert/strict';
import { trackAnchor } from '../src/tour-anchor.ts';

function fakeHost({ raf = false } = {}) {
  const listeners = new Map();
  const frames = [];
  const observers = [];
  const host = {
    addEventListener(type, fn, opts) {
      listeners.set(`${type}:${opts === true}`, fn);
    },
    removeEventListener(type, fn, opts) {
      const key = `${type}:${opts === true}`;
      if (listeners.get(key) === fn) listeners.delete(key);
    },
    ResizeObserver: class {
      constructor(cb) {
        this.cb = cb;
        this.connected = false;
        observers.push(this);
      }
      observe() {
        this.connected = true;
      }
      disconnect() {
        this.connected = false;
      }
    },
  };
  if (raf) {
    host.requestAnimationFrame = (cb) => frames.push(cb);
    host.cancelAnimationFrame = (id) => {
      frames[id - 1] = null;
    };
  }
  const fire = (key) => listeners.get(key)?.();
  const flush = () => frames.splice(0).forEach((cb) => cb?.());
  return { host, listeners, observers, fire, flush };
}

test('re-places the tour on window resize, capture-phase scroll and target resize', () => {
  const { host, observers, fire } = fakeHost();
  let calls = 0;
  trackAnchor(host, {}, () => calls++);
  fire('resize:false');
  fire('scroll:true'); // scroll inside the narrow-layout main reaches window in capture phase
  observers[0].cb();
  assert.equal(calls, 3);
  assert.equal(observers[0].connected, true);
});

test('coalesces bursts of scroll events into one placement per frame', () => {
  const { host, fire, flush } = fakeHost({ raf: true });
  let calls = 0;
  trackAnchor(host, {}, () => calls++);
  fire('scroll:true');
  fire('scroll:true');
  fire('resize:false');
  assert.equal(calls, 0);
  flush();
  assert.equal(calls, 1);
});

test('cleanup removes every listener and stops pending placements', () => {
  const { host, listeners, observers, fire, flush } = fakeHost({ raf: true });
  let calls = 0;
  const stop = trackAnchor(host, {}, () => calls++);
  fire('scroll:true');
  stop();
  flush();
  assert.equal(listeners.size, 0);
  assert.equal(observers[0].connected, false);
  assert.equal(calls, 0);
});

test('works without a target element or ResizeObserver', () => {
  const { host, fire } = fakeHost();
  delete host.ResizeObserver;
  let calls = 0;
  const stop = trackAnchor(host, null, () => calls++);
  fire('scroll:true');
  stop();
  assert.equal(calls, 1);
});
