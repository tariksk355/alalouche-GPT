import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReservationPrintJob } from '../src/boundaries/reservationPrintJobContract.js';

const full = () => ({ reservationId: 'r1', customerName: 'Valentine Aeby', dateTime: '31.07.2026 19:30', guestCount: 4,
  phone: '079 648 12 03', email: 'valentine@example.com', notes: 'Terrasse\nsi possible', status: 'Confirmée',
  title: 'RÉSERVATION', locale: 'fr', labels: { customerName: 'NOM', dateTime: 'DATE ET HEURE', guestCount: 'PERSONNES', phone: 'TÉLÉPHONE', email: 'E-MAIL', status: 'STATUT', notes: 'NOTES' } });

test('builds a typed reservation-only document', () => {
  const job = buildReservationPrintJob(full());
  assert.equal(job.ticketType, 'reservation');
  assert.deepEqual(job.displayModel.sections.map(({ key }) => key), ['customer_name', 'date_time', 'guest_count', 'phone', 'email', 'status', 'notes']);
  for (const key of ['orderId', 'orderNumber', 'items', 'totals']) assert.equal(key in job, false);
  assert.equal(job.displayModel.sections.at(-1).value, 'Terrasse\nsi possible');
  assert.equal(job.displayModel.title, 'RÉSERVATION');
});

test('omits blank optional values and bounds content', () => {
  const input = full(); input.phone = ' '; input.email = null; input.notes = 'x'.repeat(3000); input.customerName = 'é'.repeat(1000);
  const job = buildReservationPrintJob(input);
  assert.equal(job.displayModel.sections.some(({ key }) => key === 'phone' || key === 'email'), false);
  assert.equal(job.displayModel.sections.find(({ key }) => key === 'notes').value.length, 1600);
  assert.equal(job.displayModel.sections[0].value.length, 600);
});

test('omits each absent optional section', () => {
  for (const field of ['phone', 'email', 'notes']) {
    const input = full(); input[field] = field === 'notes' ? undefined : '';
    const job = buildReservationPrintJob(input);
    assert.equal(job.displayModel.sections.some(({ key }) => key === field), false);
  }
});

test('rejects unusable required values', () => {
  assert.throws(() => buildReservationPrintJob({ ...full(), guestCount: 0 }), /INVALID_RESERVATION_PRINT_DATA/);
  assert.throws(() => buildReservationPrintJob({ ...full(), customerName: ' ' }), /INVALID_RESERVATION_PRINT_DATA/);
});
