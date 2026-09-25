# UK Public Transport Data

An early-stage UK public-transport data project, beginning with Rugby bus and
rail departures. It collects reliable scheduled and live data that can later
power a Wi-Fi display, website, or API.

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

## Display MVP

The repository includes a runnable display vertical slice:

- `src/server.mjs` serves a device-facing JSON API and the browser simulator.
- `web/` contains the compact always-on display and configuration dialog.
- `firmware/esp32/display_client.ino` is the ESP32-S3 reference client. It keeps the last good display state when Wi-Fi or the API is unavailable.
- `data/fixtures/display.json` provides deterministic bus-and-rail fixture data for local development.
- `test/display.test.mjs` verifies the display contract, filtering and configuration validation.

Run it locally with:

```bash
npm install
npm test
npm run display
```

Open <http://localhost:8787>. The simulator supports a configured stop, route and direction through **Configure display**. The API exposes `POST /api/v1/provision`, `GET/PUT /api/v1/devices/:deviceId/config` and `GET /api/v1/display?deviceId=...`.

Set `DISPLAY_DATA_FILE` to a normalised cached data file when connecting the API to a real poller. Runtime device configuration is written under `data/config/`, which is ignored because it contains device-specific state.

### Connect live bus and rail data

`display:poll` merges a normalised BODS departures response with the Darwin board written by `darwin:snapshot`. Configure `BODS_DEPARTURES_URL` and the optional `BODS_API_KEY`, then run:

```bash
npm run darwin:snapshot
npm run display:poll
npm run display
```

For continuous cache refresh, use `npm run display:watch`. If an upstream request fails, the last successful cache is retained and marked `stale: true`, so the display can keep showing known data instead of going blank.

### Validate a pilot run

The ESP32 sketch uses `TFT_eSPI`; configure that library for the selected 4–5 inch module, then upload `firmware/esp32/display_client.ino`. It renders the stop, freshness state, route, expected time, destination and delay on the TFT and retains the last good frame when refresh fails.

With the API running, `npm run display:validate` records one sample. Set `VALIDATION_DURATION_SECONDS` and `VALIDATION_INTERVAL_SECONDS` for a longer run; samples are written as JSON Lines to `data/validation/display-samples.jsonl` and include latency, stale state, departure count, HTTP status and errors.

## Local setup

1. Copy `.env.example` to `.env`.
2. Put your BODS API key in `BODS_API_KEY`.
3. Never commit `.env` or an API key.

## Train data: Rugby station

National Rail's Darwin feed has been tested successfully for Rugby station
(`RUGBY`). The downloaded snapshot includes:

- scheduled and expected departure times;
- platforms;
- train service and journey identifiers;
- operator codes; and
- origin and destination station codes.

This is enough to build a real departure board and surface disruptions. In the
test snapshot, a Glasgow Central to London Euston service scheduled at Rugby
for 21:32 was forecast to depart at 21:55 from platform 4.

### How the railway feed works

```text
Darwin SFTP snapshot ──> complete Rugby departure board
Darwin STOMP live topic ─> incremental delay, platform and service updates
                              └──> normalised public-transport data API
```

The snapshot provides a complete starting state. The live topic is then used to
keep that state current between refreshes. See [the Darwin pilot notes](docs/darwin-pilot.md)
for the tested result and integration approach.

### Run the railway poller

With the Darwin fields set in `.env`:

```bash
npm install
npm run darwin:snapshot
npm run darwin:topic
```

`darwin:snapshot` writes a normalised Rugby departure board to
`data/darwin/rugby-departures.json`. `darwin:topic` records the count and
timestamps of incremental Darwin updates. Generated data is ignored by Git.

## Next build steps

1. Download and normalise the timetable for services 1 and 2.
2. Poll and cache BODS live positions every 15–30 seconds.
3. Refresh and cache the Darwin snapshot, applying live-topic updates between
   refreshes.
4. Connect the display API to the live BODS bus cache and Darwin snapshot/topic updater.
5. Add a hardware-specific renderer for the selected ESP32 display module.
6. Run the multi-day Rugby pilot and record freshness, delay accuracy and recovery results.

## Notes

- The initial proof query returned live Stagecoach Midlands vehicles for Rugby, including routes 1, 2, 4, 8, 25A, 63, 84, 85, 86, 96S and D1.
- Raw upstream data may contain fields that should not be exposed to devices or stored unnecessarily. The backend should retain only the journey and vehicle data needed to calculate departures.
- See [data sources and attribution](docs/data-sources.md) before release or redistribution.

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) for local setup and contribution rules,
and [SECURITY.md](SECURITY.md) to report vulnerabilities or exposed credentials.
