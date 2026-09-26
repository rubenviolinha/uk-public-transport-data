import { normaliseDepartures } from './transport-data.mjs';

function sameValue(left, right) {
  return left != null && right != null && String(left) === String(right);
}

function matchesScheduledService(live, scheduled) {
  const sameStop = !live.stopId || !scheduled.stopId || sameValue(live.stopId, scheduled.stopId);
  const sameDirection = !live.direction || !scheduled.direction || sameValue(live.direction, scheduled.direction);
  const sameService = live.serviceId && scheduled.serviceId && sameValue(live.serviceId, scheduled.serviceId);
  const sameLine = sameValue(live.line, scheduled.line) || sameValue(live.serviceId, scheduled.line);
  const sameTime = sameValue(live.scheduledTime, scheduled.scheduledTime);
  return sameStop && sameDirection && (sameService || (sameLine && sameTime));
}

export function mergeScheduledDepartures(liveSource, timetableSource) {
  const live = normaliseDepartures(liveSource, 'bus');
  const scheduled = normaliseDepartures(timetableSource, 'bus');
  const usedLive = new Set();
  const departures = scheduled.map((scheduledDeparture) => {
    const liveIndex = live.findIndex((liveDeparture, index) => !usedLive.has(index) && matchesScheduledService(liveDeparture, scheduledDeparture));
    if (liveIndex === -1) return scheduledDeparture;
    usedLive.add(liveIndex);
    const liveDeparture = live[liveIndex];
    return {
      ...scheduledDeparture,
      ...liveDeparture,
      scheduledTime: scheduledDeparture.scheduledTime,
      destination: liveDeparture.destination === 'Unknown destination' ? scheduledDeparture.destination : liveDeparture.destination,
      stopId: scheduledDeparture.stopId ?? liveDeparture.stopId,
      direction: scheduledDeparture.direction ?? liveDeparture.direction
    };
  });
  return [...departures, ...live.filter((_, index) => !usedLive.has(index))];
}
