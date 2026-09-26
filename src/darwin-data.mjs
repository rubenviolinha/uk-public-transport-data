function attributes(markup) {
  return Object.fromEntries([...markup.matchAll(/([A-Za-z0-9_]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]));
}

function parseSchedules(xml) {
  const schedules = new Map();
  for (const document of xml.split(/(?=<\?xml )/)) {
    const match = document.match(/<schedule\s+([^>]+)>([\s\S]*?)<\/schedule>/);
    if (!match) continue;
    const service = attributes(match[1]);
    const locations = [...match[2].matchAll(/<(?:ns2:)?(?:OR|IP|DT)\s+([^>]+)\/>/g)].map((item) => attributes(item[1]));
    schedules.set(service.rid, {
      operator: service.toc ?? null,
      serviceId: service.trainId ?? null,
      origin: locations[0]?.tpl ?? null,
      destination: locations.at(-1)?.tpl ?? null
    });
  }
  return schedules;
}

export function parseDarwinDepartures(xml, stationCode) {
  const schedules = parseSchedules(xml);
  const departures = [];
  for (const document of xml.split(/(?=<\?xml )/)) {
    const trainStatus = document.match(/<TS\s+([^>]+)>([\s\S]*?)<\/TS>/);
    if (!trainStatus) continue;
    const train = attributes(trainStatus[1]);
    const locationPattern = new RegExp(`<ns5:Location\\s+([^>]*\\btpl="${stationCode}"[^>]*)>([\\s\\S]*?)<\\/ns5:Location>`, 'g');
    for (const locationMatch of trainStatus[2].matchAll(locationPattern)) {
      const location = attributes(locationMatch[1]);
      const departure = locationMatch[2].match(/<ns5:dep\s+([^/>]*)\/>/);
      if (!location.ptd || !departure) continue;
      const prediction = attributes(departure[1]);
      const platform = locationMatch[2].match(/<ns5:plat[^>]*>([^<]+)<\/ns5:plat>/)?.[1] ?? null;
      departures.push({
        station: stationCode,
        scheduledTime: location.ptd,
        expectedTime: prediction.et ?? prediction.at ?? null,
        platform,
        predictionSource: prediction.src ?? null,
        runId: train.rid,
        journeyId: train.uid,
        ...schedules.get(train.rid)
      });
    }
  }
  return departures.sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
}

export function mergeDarwinDepartures(existing, updates) {
  const merged = [...existing];
  for (const update of updates) {
    const index = merged.findIndex((departure) =>
      (update.runId && departure.runId === update.runId) ||
      (update.journeyId && departure.journeyId === update.journeyId)
    );
    if (index === -1) merged.push(update);
    else merged[index] = { ...merged[index], ...Object.fromEntries(Object.entries(update).filter(([, value]) => value !== null && value !== undefined)) };
  }
  return merged.sort((a, b) => String(a.scheduledTime).localeCompare(String(b.scheduledTime)));
}
