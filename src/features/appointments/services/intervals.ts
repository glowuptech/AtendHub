import { minutes, timeLabel } from "./schedule";

export type AvailabilityInterval = {
  day: string;
  startMinute: number;
  endMinute: number;
};

export function intervalsToSlots(intervals: AvailabilityInterval[]) {
  return intervals.flatMap(({ day, startMinute, endMinute }) =>
    Array.from(
      { length: endMinute - startMinute },
      (_, index) => `${day}T${timeLabel(startMinute + index)}`,
    ),
  );
}

export function slotsToIntervals(slots: string[]): AvailabilityInterval[] {
  const byDay = new Map<string, number[]>();
  for (const slot of new Set(slots)) {
    const day = slot.slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), minutes(slot.slice(11))]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([day, values]) => {
      const result: AvailabilityInterval[] = [];
      for (const minute of values.sort((a, b) => a - b)) {
        const last = result.at(-1);
        if (last && last.endMinute === minute) last.endMinute = minute + 1;
        else result.push({ day, startMinute: minute, endMinute: minute + 1 });
      }
      return result;
    });
}
