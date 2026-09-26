# Display API contract

`GET /api/v1/display?deviceId=demo-display`

The device configuration selects the stop, direction and optional route. The
server filters departures before returning them to a browser or device.

## Response fields

| Field | Meaning |
| --- | --- |
| `scheduledTime` | The timetable departure in the stop's local time. |
| `expectedTime` | The best live estimate, when available. |
| `delayMinutes` | `expectedTime - scheduledTime`, rounded to the nearest minute. |
| `status` | `live`, `scheduled`, `cancelled`, or `unknown`. |
| `platform` | Platform information when supplied by the source, otherwise `null`. |
| `attribution` | The source attribution that should remain visible in a consuming display or product. |

## Rules

1. Return at most the next eight departures after stop, direction and route filtering.
2. Prefer a live match only when the position timestamp is fresh and the journey can be identified.
3. When live data is stale or absent, preserve the known timetable time and set `stale: true` at the response level.
4. Do not return raw driver identifiers or unnecessary upstream fields.
5. Cache upstream responses centrally; displays must call only this API.
