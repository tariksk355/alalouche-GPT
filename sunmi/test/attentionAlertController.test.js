import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAttentionAlertQueue,
  createAttentionPlaybackController,
  detectUnseenAttentionRecords,
} from '../src/alerts/attentionAlertController.js';

function alert(type, id) {
  return { key: `${type}:${id}`, type, recordId: id };
}

test('initial detection silently baselines records and later preserves API order', () => {
  const seenOrderIds = new Set();
  const seenReservationIds = new Set();
  const baseline = detectUnseenAttentionRecords({
    orders: [{ id: 'o1' }, { id: 'o2' }],
    reservations: [{ id: 'r1' }],
    seenOrderIds,
    seenReservationIds,
    hasHydratedBaseline: false,
  });
  assert.deepEqual(baseline.newOrders, []);
  assert.deepEqual(baseline.newReservations, []);

  const next = detectUnseenAttentionRecords({
    orders: [{ id: 'o1' }, { id: 'o3' }, { id: 'o4' }, { id: 'o3' }],
    reservations: [{ id: 'r2' }, { id: 'r1' }, { id: 'r3' }],
    seenOrderIds,
    seenReservationIds,
    hasHydratedBaseline: baseline.hydratedBaseline,
  });
  assert.deepEqual(next.newOrders.map((item) => item.id), ['o3', 'o4']);
  assert.deepEqual(next.newReservations.map((item) => item.id), ['r2', 'r3']);
});

test('attention queue preserves FIFO order, type-scoped keys, and active alert', () => {
  const activated = [];
  const queue = createAttentionAlertQueue({ onActivate: (item) => activated.push(item.key) });

  queue.enqueue([alert('order', '1'), alert('order', '2'), alert('reservation', '1')]);
  queue.enqueue([alert('order', '3'), alert('order', '1')]);

  assert.equal(queue.getActive().key, 'order:1');
  assert.deepEqual(queue.getPending().map((item) => item.key), [
    'order:2',
    'reservation:1',
    'order:3',
  ]);
  assert.deepEqual(activated, ['order:1']);
});

test('acknowledgement advances exactly once and stale acknowledgements cannot skip', () => {
  const queue = createAttentionAlertQueue();
  queue.enqueue([alert('order', '1'), alert('order', '2'), alert('order', '3')]);

  assert.equal(queue.acknowledge('order:1'), true);
  assert.equal(queue.getActive().key, 'order:2');
  assert.equal(queue.acknowledge('order:1'), false);
  assert.equal(queue.getActive().key, 'order:2');
  assert.deepEqual(queue.getPending().map((item) => item.key), ['order:3']);
});

test('reset clears active and pending alerts', () => {
  const queue = createAttentionAlertQueue();
  queue.enqueue([alert('reservation', '1'), alert('reservation', '2')]);
  queue.reset();
  assert.equal(queue.getActive(), null);
  assert.deepEqual(queue.getPending(), []);
});

test('stale reconciliation removes active and pending alerts and advances FIFO once', () => {
  const activated = [];
  const deactivated = [];
  const queue = createAttentionAlertQueue({
    onActivate: (item) => activated.push(item.key),
    onDeactivate: (item) => deactivated.push(item.key),
  });
  queue.enqueue([alert('order', '1'), alert('reservation', '2'), alert('order', '3')]);

  assert.equal(queue.removeWhere((item) => item.key === 'order:1' || item.key === 'reservation:2'), true);
  assert.equal(queue.getActive().key, 'order:3');
  assert.deepEqual(queue.getPending(), []);
  assert.deepEqual(activated, ['order:1', 'order:3']);
  assert.deepEqual(deactivated, ['order:1']);
});

test('stale reconciliation leaves a current active alert untouched', () => {
  const queue = createAttentionAlertQueue();
  queue.enqueue([alert('reservation', '1'), alert('order', '2')]);
  assert.equal(queue.removeWhere((item) => item.key === 'order:2'), false);
  assert.equal(queue.getActive().key, 'reservation:1');
  assert.deepEqual(queue.getPending(), []);
});

test('playback starts immediately and repeats only after completion plus silence', async () => {
  const timers = [];
  const completions = [];
  let plays = 0;
  const active = { key: 'order:1' };
  const controller = createAttentionPlaybackController({
    playCycle: () => {
      plays += 1;
      let resolve;
      const completion = new Promise((done) => { resolve = done; });
      completions.push(resolve);
      return { completion, stop() {} };
    },
    isCurrentAlert: (key) => active.key === key,
    isSoundEnabled: () => true,
    setTimeoutFn: (callback, delay) => {
      timers.push({ callback, delay, cancelled: false });
      return timers.length - 1;
    },
    clearTimeoutFn: (id) => { timers[id].cancelled = true; },
  });

  controller.start(active);
  assert.equal(plays, 1);
  assert.equal(timers.length, 0);
  completions[0]();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(timers[0].delay, 4000);
  timers[0].callback();
  assert.equal(plays, 2);
});

test('stop is idempotent and invalidates active and silent callbacks', async () => {
  const timers = [];
  let resolveCompletion;
  let stops = 0;
  let plays = 0;
  const active = { key: 'reservation:1' };
  const controller = createAttentionPlaybackController({
    playCycle: () => {
      plays += 1;
      return {
        completion: new Promise((resolve) => { resolveCompletion = resolve; }),
        stop: () => { stops += 1; },
      };
    },
    isCurrentAlert: (key) => active.key === key,
    isSoundEnabled: () => true,
    setTimeoutFn: (callback, delay) => {
      timers.push({ callback, delay, cancelled: false });
      return timers.length - 1;
    },
    clearTimeoutFn: (id) => { timers[id].cancelled = true; },
  });

  controller.start(active);
  controller.stop();
  controller.stop();
  resolveCompletion();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(stops, 1);
  assert.equal(timers.length, 0);
  assert.equal(plays, 1);
});

test('stop during the silent interval cancels replay', async () => {
  const timers = [];
  let plays = 0;
  const active = { key: 'order:silent' };
  const controller = createAttentionPlaybackController({
    playCycle: () => {
      plays += 1;
      return { completion: Promise.resolve(), stop() {} };
    },
    isCurrentAlert: (key) => active.key === key,
    isSoundEnabled: () => true,
    setTimeoutFn: (callback, delay) => {
      timers.push({ callback, delay, cancelled: false });
      return timers.length - 1;
    },
    clearTimeoutFn: (id) => { timers[id].cancelled = true; },
  });

  controller.start(active);
  await Promise.resolve();
  await Promise.resolve();
  controller.stop();
  assert.equal(timers[0].cancelled, true);
  timers[0].callback();
  assert.equal(plays, 1);
});

test('playback failure is non-fatal and retries only on the normal cadence', async () => {
  const timers = [];
  let plays = 0;
  let errors = 0;
  const active = { key: 'order:failure' };
  const controller = createAttentionPlaybackController({
    playCycle: () => {
      plays += 1;
      throw new Error('audio unavailable');
    },
    isCurrentAlert: (key) => active.key === key,
    isSoundEnabled: () => true,
    setTimeoutFn: (callback, delay) => {
      timers.push({ callback, delay });
      return timers.length - 1;
    },
    clearTimeoutFn: () => {},
    onError: () => { errors += 1; },
  });

  controller.start(active);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(plays, 1);
  assert.equal(errors, 1);
  assert.equal(timers[0].delay, 4000);
  timers[0].callback();
  assert.equal(plays, 2);
});

test('sound disable stops playback and re-enable starts one immediate cycle', () => {
  let enabled = true;
  let plays = 0;
  let stops = 0;
  const active = { key: 'order:settings' };
  const controller = createAttentionPlaybackController({
    playCycle: () => {
      plays += 1;
      return { completion: new Promise(() => {}), stop: () => { stops += 1; } };
    },
    isCurrentAlert: (key) => active.key === key,
    isSoundEnabled: () => enabled,
  });

  controller.start(active);
  enabled = false;
  controller.stop();
  assert.equal(stops, 1);

  enabled = true;
  controller.start(active);
  assert.equal(plays, 2);
  assert.equal(stops, 1);
});
