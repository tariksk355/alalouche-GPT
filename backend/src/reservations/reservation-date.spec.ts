import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { reservationDateInTimeZone } from './reservation-date';

test('converts Zurich summer and winter civil times to the correct UTC instants', () => {
  assert.equal(reservationDateInTimeZone('2026-07-31', '18:00', 'Europe/Zurich').toISOString(), '2026-07-31T16:00:00.000Z');
  assert.equal(reservationDateInTimeZone('2027-01-31', '18:00', 'Europe/Zurich').toISOString(), '2027-01-31T17:00:00.000Z');
});

test('does not depend on the Node process timezone', () => {
  const originalTimeZone = process.env.TZ;
  try {
    for (const runtimeTimeZone of ['UTC', 'Europe/Zurich', 'America/New_York']) {
      process.env.TZ = runtimeTimeZone;
      assert.equal(reservationDateInTimeZone('2026-07-31', '18:00', 'Europe/Zurich').toISOString(), '2026-07-31T16:00:00.000Z');
    }
  } finally {
    if (originalTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimeZone;
  }
});

test('rejects invalid dates, times, and IANA timezone identifiers', () => {
  for (const [date, time, timeZone] of [
    ['2026-02-30', '18:00', 'Europe/Zurich'],
    ['2026-07-31', '18:75', 'Europe/Zurich'],
    ['2026-07-31', '18:00', 'Invalid/Timezone'],
  ]) {
    assert.throws(() => reservationDateInTimeZone(date, time, timeZone), BadRequestException);
  }
});

test('the stored/API instant formats back to the selected Zurich time', () => {
  const instant = reservationDateInTimeZone('2026-07-31', '18:00', 'Europe/Zurich');
  assert.equal(instant.toISOString(), '2026-07-31T16:00:00.000Z');
  assert.equal(new Intl.DateTimeFormat('fr-CH', {
    timeZone: 'Europe/Zurich',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(instant), '18:00');
});
