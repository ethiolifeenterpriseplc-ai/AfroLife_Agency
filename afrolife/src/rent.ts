// Pure helpers for lease schedules. Dates are Gregorian ISO strings (YYYY-MM-DD).
export function rentSchedule(startISO: string, months: number, rent: number, dueDay = 5) {
  const [y, m, startDay] = startISO.split('-').map(Number);
  const endISO = endDate(startISO, months);
  const [endYear, endMonth, endDay] = endISO.split('-').map(Number);
  const end = new Date(Date.UTC(endYear, endMonth - 1, endDay));
  const safeDueDay = Math.min(Math.max(dueDay, 1), 28);
  const schedule: { period: string; due_on: string; amount: number }[] = [];
  for (let month = new Date(Date.UTC(y, m - 1, 1)); month <= end; month = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1))) {
    const year = month.getUTCFullYear(), monthIndex = month.getUTCMonth();
    const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
    const segmentStart = year === y && monthIndex === m - 1 ? startDay : 1;
    const segmentEnd = year === endYear && monthIndex === endMonth - 1 ? endDay : daysInMonth;
    const occupiedDays = segmentEnd - segmentStart + 1;
    const partialFirstDue = year === y && monthIndex === m - 1 && startDay > safeDueDay;
    const due = partialFirstDue ? segmentStart : Math.min(safeDueDay, segmentEnd);
    schedule.push({
      period: month.toISOString().slice(0, 10),
      due_on: new Date(Date.UTC(year, monthIndex, due)).toISOString().slice(0, 10),
      amount: Math.round(rent * occupiedDays / daysInMonth * 100) / 100,
    });
  }
  return schedule;
}

/** The lease ends one day before its calendar-month anniversary (clamped for short months). */
export function endDate(startISO: string, months: number): string {
  const [y, m, d] = startISO.split('-').map(Number);
  const anniversaryMonth = new Date(Date.UTC(y, m - 1 + months, 1));
  const anniversaryDay = Math.min(d, new Date(Date.UTC(anniversaryMonth.getUTCFullYear(), anniversaryMonth.getUTCMonth() + 1, 0)).getUTCDate());
  return new Date(Date.UTC(anniversaryMonth.getUTCFullYear(), anniversaryMonth.getUTCMonth(), anniversaryDay - 1)).toISOString().slice(0, 10);
}
