# Smart Bus Tracker Display

A compact Wi-Fi display for homes, workplaces and public spaces that shows nearby bus departures, live vehicle status and delay information.

## Pilot: Rugby Rail Station

The first pilot uses the two stops outside Rugby Rail Station on Murray Road:

| Stop | ATCO code | Services | Direction |
| --- | --- | --- | --- |
| Rugby Rail Station (Adj) | `4200F057700` | 1, 2, 4, 4A, 8, 8A, 8B, 96, 96A, 96S, D1 | Northbound |
| Rugby Rail Station (Opp) | `4200F058301` | 1, 2, 4, 4A, 8, 8A, 8B, 96, 96A, 96S, D1 | Southbound |

For a weekday morning, the display can show buses 1 and 2 from either side of the station. See [the Rugby pilot notes](docs/rugby-pilot.md) for the tested timetable.

## Data approach

The UK Department for Transport's Bus Open Data Service (BODS) supplies:

- scheduled routes, trips and stop times;
- live vehicle locations through SIRI-VM; and
- journey identifiers that can be matched to the timetable.

The service does not reliably supply a ready-made departure prediction for each stop. This project will calculate a display-friendly estimate by matching a live vehicle to its scheduled journey, then calculating the delay at the selected stop.

```text
BODS schedules + stops ──┐
                         ├── backend ──> lightweight device API ──> ESP32 display
BODS live vehicles ──────┘
```

## Example display response

```json
{
  "stop": {
    "name": "Rugby Rail Station (Adj)",
    "atcoCode": "4200F057700"
  },
  "generatedAt": "2026-09-24T07:00:00+01:00",
  "departures": [
    {
      "line": "2",
      "destination": "Rugby Gateway",
      "scheduledTime": "07:13",
      "expectedTime": "07:16",
      "delayMinutes": 3,
      "status": "live"
    },
    {
      "line": "1",
      "destination": "Merlin Close",
      "scheduledTime": "07:43",
      "expectedTime": "07:43",
      "delayMinutes": 0,
      "status": "scheduled"
    }
  ]
}
```

## Local setup

1. Copy `.env.example` to `.env`.
2. Put your BODS API key in `BODS_API_KEY`.
3. Never commit `.env` or an API key.

## Next build steps

1. Download and normalise the timetable for services 1 and 2.
2. Poll and cache BODS live positions every 15–30 seconds.
3. Implement an endpoint that returns the JSON display response above.
4. Build a browser display simulator.
5. Connect the same endpoint to an ESP32-S3 display.

## Notes

- The initial proof query returned live Stagecoach Midlands vehicles for Rugby, including routes 1, 2, 4, 8, 25A, 63, 84, 85, 86, 96S and D1.
- Raw upstream data may contain fields that should not be exposed to devices or stored unnecessarily. The backend should retain only the journey and vehicle data needed to calculate departures.
- Attribution and usage requirements from BODS must be checked before release.
