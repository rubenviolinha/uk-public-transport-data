# Rugby Rail Station pilot

## Stops

Rugby Rail Station has two stops on Murray Road. They must be treated as separate selectable stops in the product.

| Name | ATCO code | Direction |
| --- | --- | --- |
| Rugby Rail Station (Adj) | `4200F057700` | Northbound |
| Rugby Rail Station (Opp) | `4200F058301` | Southbound |

## Weekday-morning timetable: routes 1 and 2

### Rugby Rail Station (Adj)

| Route | Destination | Scheduled morning departures |
| --- | --- | --- |
| 1 | Merlin Close | 06:45, 07:43, 08:59, 09:49, 10:49, 11:49 |
| 2 | Rugby Gateway | 07:13, 08:13, 09:22, 10:26, 11:19 |

### Rugby Rail Station (Opp)

| Route | Destination | Scheduled morning departures |
| --- | --- | --- |
| 1 | DIRFT Celtic Way | 07:51, 08:47, 09:56, 10:58, 11:53 |
| 2 | Hillmorton Edgecote Close | 07:22, 08:22, 09:33, 10:23, 11:23 |

These are scheduled times, not predictions. The first working UI should make that explicit whenever no usable live vehicle match exists.

## Live-data proof

The BODS SIRI-VM feed was queried successfully for the Rugby area. It returned fresh Stagecoach Midlands live positions, including:

- route 1 vehicle `SCNH-36212`;
- route 2 vehicle `SCNH-36482`;
- route 85 vehicles in both Rugby/Coventry directions.

The current Stagecoach feed provides vehicle location, route, direction, vehicle journey and scheduled origin departure. It did not include an onward-call or per-stop predicted-arrival time in the sampled route 85 records. The app therefore needs its own timetable matching and estimate calculation.

## Product decision

Start with `4200F057700` (Adj), routes 1 and 2. It has a simple, useful weekday-morning board and active live vehicle coverage.
