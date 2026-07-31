import { BadRequestException } from '@nestjs/common';

type CivilDateTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function parseCivilDateTime(date: string, time: string): CivilDateTime {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dateMatch || !timeMatch) {
    throw new BadRequestException({ error: 'INVALID_RESERVATION_DATE_TIME', message: 'Reservation date or time is invalid.' });
  }

  const value = {
    year: Number(dateMatch[1]),
    month: Number(dateMatch[2]),
    day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]),
    minute: Number(timeMatch[2]),
  };
  const calendarCheck = new Date(Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute));
  if (
    value.hour > 23
    || value.minute > 59
    || calendarCheck.getUTCFullYear() !== value.year
    || calendarCheck.getUTCMonth() + 1 !== value.month
    || calendarCheck.getUTCDate() !== value.day
  ) {
    throw new BadRequestException({ error: 'INVALID_RESERVATION_DATE_TIME', message: 'Reservation date or time is invalid.' });
  }

  return value;
}

function partsAt(instant: Date, timeZone: string): CivilDateTime {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((candidate) => candidate.type === type)?.value);
  return { year: part('year'), month: part('month'), day: part('day'), hour: part('hour'), minute: part('minute') };
}

export function reservationDateInTimeZone(date: string, time: string, timeZone: string): Date {
  const requested = parseCivilDateTime(date, time);
  const requestedAsUtc = Date.UTC(requested.year, requested.month - 1, requested.day, requested.hour, requested.minute);

  let candidate = new Date(requestedAsUtc);
  try {
    // Recalculate once at the candidate instant so a DST boundary uses the offset in effect at that instant.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const rendered = partsAt(candidate, timeZone);
      const renderedAsUtc = Date.UTC(rendered.year, rendered.month - 1, rendered.day, rendered.hour, rendered.minute);
      candidate = new Date(candidate.getTime() + requestedAsUtc - renderedAsUtc);
    }
  } catch (error) {
    if (error instanceof RangeError) {
      throw new BadRequestException({ error: 'INVALID_RESTAURANT_TIMEZONE', message: 'Restaurant timezone is invalid.' });
    }
    throw error;
  }

  const rendered = partsAt(candidate, timeZone);
  if (!Number.isFinite(candidate.getTime()) || Object.keys(requested).some((key) => requested[key as keyof CivilDateTime] !== rendered[key as keyof CivilDateTime])) {
    throw new BadRequestException({ error: 'INVALID_RESERVATION_DATE_TIME', message: 'Reservation date or time does not exist in the restaurant timezone.' });
  }

  return candidate;
}
