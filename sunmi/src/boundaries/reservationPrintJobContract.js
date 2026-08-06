const MAX_VALUE_LENGTH = 600;
const MAX_NOTES_LENGTH = 1600;

function boundedText(value, maxLength = MAX_VALUE_LENGTH) {
  return String(value ?? '').replace(/\r\n?/g, '\n').trim().slice(0, maxLength);
}

export function buildReservationPrintJob(snapshot) {
  const reservationId = boundedText(snapshot?.reservationId, 160);
  const customerName = boundedText(snapshot?.customerName);
  const dateTime = boundedText(snapshot?.dateTime);
  const status = boundedText(snapshot?.status);
  const title = boundedText(snapshot?.title);
  const guestCount = Number(snapshot?.guestCount);
  if (!reservationId || !customerName || !dateTime || dateTime === '-' || !status || !title || !Number.isInteger(guestCount) || guestCount < 1) {
    throw new Error('INVALID_RESERVATION_PRINT_DATA');
  }

  const sections = [
    { key: 'customer_name', label: boundedText(snapshot.labels?.customerName), value: customerName },
    { key: 'date_time', label: boundedText(snapshot.labels?.dateTime), value: dateTime },
    { key: 'guest_count', label: boundedText(snapshot.labels?.guestCount), value: String(guestCount) },
  ];
  const optional = [
    ['phone', snapshot.labels?.phone, snapshot.phone, MAX_VALUE_LENGTH],
    ['email', snapshot.labels?.email, snapshot.email, MAX_VALUE_LENGTH],
    ['status', snapshot.labels?.status, status, MAX_VALUE_LENGTH],
    ['notes', snapshot.labels?.notes, snapshot.notes, MAX_NOTES_LENGTH],
  ];
  optional.forEach(([key, label, value, max]) => {
    const normalized = boundedText(value, max);
    const normalizedLabel = boundedText(label);
    if (normalized && normalizedLabel) sections.push({ key, label: normalizedLabel, value: normalized });
  });
  if (sections.some((section) => !section.label || !section.value)) throw new Error('INVALID_RESERVATION_PRINT_DATA');

  return {
    schemaVersion: '1.0',
    ticketType: 'reservation',
    printJobId: `reservation_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    createdAtIso: new Date().toISOString(),
    reservationId,
    displayModel: { title, sections },
    formattingHints: { paperWidth: '58mm', locale: boundedText(snapshot.locale, 16) || 'en' },
  };
}
