# Darwin railway pilot

## Result

The Rugby rail pilot is viable. The National Rail Darwin live snapshot was
successfully retrieved and contains real-time departure forecasts for Rugby
station (`RUGBY`).

The snapshot provides the fields needed for a station-board display:

- scheduled departure time;
- expected departure time, including live delays;
- platform;
- origin and destination TIPLOCs;
- operator code and service identifiers.

For example, the 23 September 2026 snapshot contained a Glasgow Central to
London Euston service scheduled at Rugby for 21:32, with a Darwin forecast of
21:55 from platform 4. This verifies that the display can surface a meaningful
live disruption rather than merely a static timetable.

## Recommended integration

1. Download the Darwin SFTP `snapshot.gz` periodically to create the complete
   Rugby departure board.
2. Match the `RUGBY` location records to the associated schedule records by
   `rid` to obtain service details and destination.
3. Subscribe to the Darwin STOMP live-feed topic in production, applying its
   incremental updates between snapshots.
4. Translate TIPLOCs to public station names using the National Rail reference
   data before rendering the display.

The S3 `PPTimetable/` subscription also works, but it is a static timetable
feed. It is useful for scheduled data and route planning, not as the primary
real-time source.

## Configuration

The local `.env` file holds the credentials. It is ignored by Git. Copy
`.env.example` when setting up a new environment; never commit credentials.
