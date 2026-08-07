export function createAttentionAlertQueue({ onActivate, onDeactivate } = {}) {
  let active = null;
  let pending = [];

  function activateNext() {
    if (active || pending.length === 0) return active;
    active = pending.shift();
    onActivate?.(active);
    return active;
  }

  return {
    getActive() {
      return active;
    },
    getPending() {
      return [...pending];
    },
    enqueue(alerts) {
      const existingKeys = new Set([
        active?.key,
        ...pending.map((alert) => alert.key),
      ].filter(Boolean));

      for (const alert of alerts) {
        if (!alert?.key || existingKeys.has(alert.key)) continue;
        pending.push(alert);
        existingKeys.add(alert.key);
      }

      return activateNext();
    },
    acknowledge(expectedKey) {
      if (!active || active.key !== expectedKey) return false;
      const acknowledged = active;
      active = null;
      onDeactivate?.(acknowledged);
      activateNext();
      return true;
    },
    removeWhere(predicate) {
      pending = pending.filter((alert) => !predicate(alert));
      let removedActive = false;
      while (active && predicate(active)) {
        const removed = active;
        active = null;
        removedActive = true;
        onDeactivate?.(removed);
        activateNext();
      }
      return removedActive;
    },
    reset() {
      const previous = active;
      active = null;
      pending = [];
      if (previous) onDeactivate?.(previous);
    },
  };
}

export function detectUnseenAttentionRecords({
  orders,
  reservations,
  seenOrderIds,
  seenReservationIds,
  hasHydratedBaseline,
}) {
  const nextOrders = Array.isArray(orders) ? orders : [];
  const nextReservations = Array.isArray(reservations) ? reservations : [];

  if (!hasHydratedBaseline) {
    for (const order of nextOrders) {
      if (order?.id) seenOrderIds.add(order.id);
    }
    for (const reservation of nextReservations) {
      if (reservation?.id) seenReservationIds.add(reservation.id);
    }
    return { hydratedBaseline: true, newOrders: [], newReservations: [] };
  }

  const newOrders = [];
  for (const order of nextOrders) {
    if (!order?.id || seenOrderIds.has(order.id)) continue;
    seenOrderIds.add(order.id);
    newOrders.push(order);
  }

  const newReservations = [];
  for (const reservation of nextReservations) {
    if (!reservation?.id || seenReservationIds.has(reservation.id)) continue;
    seenReservationIds.add(reservation.id);
    newReservations.push(reservation);
  }

  return { hydratedBaseline: true, newOrders, newReservations };
}

export function createAttentionPlaybackController({
  playCycle,
  isCurrentAlert,
  isSoundEnabled,
  silenceMs = 4000,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  onError = () => {},
}) {
  let generation = 0;
  let activeKey = null;
  let activeCycle = null;
  let replayTimer = null;

  function disposeCycle() {
    const cycle = activeCycle;
    activeCycle = null;
    try {
      cycle?.stop?.();
    } catch (error) {
      onError(error);
    }
  }

  function stop() {
    generation += 1;
    activeKey = null;
    if (replayTimer !== null) {
      clearTimeoutFn(replayTimer);
      replayTimer = null;
    }
    disposeCycle();
  }

  function start(alert) {
    stop();
    if (!alert?.key || !isSoundEnabled(alert)) return;

    activeKey = alert.key;
    const ownGeneration = generation;

    const remainsCurrent = () => (
      generation === ownGeneration
      && activeKey === alert.key
      && isCurrentAlert(alert.key)
      && isSoundEnabled(alert)
    );

    const runCycle = () => {
      if (!remainsCurrent()) return;

      try {
        activeCycle = playCycle(alert);
      } catch (error) {
        activeCycle = null;
        onError(error);
      }

      const completion = activeCycle?.completion || Promise.resolve();
      Promise.resolve(completion)
        .catch(onError)
        .then(() => {
          if (!remainsCurrent()) return;
          activeCycle = null;
          replayTimer = setTimeoutFn(() => {
            replayTimer = null;
            runCycle();
          }, silenceMs);
        });
    };

    runCycle();
  }

  return { start, stop };
}
