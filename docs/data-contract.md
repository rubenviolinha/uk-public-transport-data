# Display API contract (draft)

`GET /v1/stops/{atcoCode}/departures?lines=1,2`

## Response fields

| Field | Meaning |
| --- | --- |
| `scheduledTime` | The timetable departure in the stop's local time. |
| `expectedTime` | The best live estimate, when available. |
| `delayMinutes` | `expectedTime - scheduledTime`, rounded to the nearest minute. |
| `status` | `live`, `scheduled`, `cancelled`, or `unknown`. |
| `confidence` | `high`, `medium`, or `low`, based on journey matching and feed freshness. |

## Rules

1. Return at most the next five departures per configured line.
2. Prefer a live match only when the position timestamp is fresh and the journey can be identified.
3. When live data is stale or absent, return the timetable time with `status: "scheduled"`.
4. Do not return raw driver identifiers or unnecessary upstream fields.
5. Cache BODS responses centrally; displays must call only this API.
