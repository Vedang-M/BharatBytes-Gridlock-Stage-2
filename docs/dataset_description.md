# Dataset Description

**File**: `jan to may police violation_anonymized791b166.csv`
**Rows**: 298,450  |  **Columns**: 24

| # | Column | Type | Description |
|---|--------|------|-------------|
| 1 | `id` | string | Unique violation ID (anonymized) |
| 2 | `latitude` | float | GPS latitude |
| 3 | `longitude` | float | GPS longitude |
| 4 | `location` | string | Human-readable address |
| 5 | `vehicle_number` | string | Vehicle registration (anonymized) |
| 6 | `vehicle_type` | string | CAR, SCOOTER, HGV, BUS, etc. |
| 7 | `description` | string | Officer notes (mostly NULL) |
| 8 | `violation_type` | string | JSON list of violation codes |
| 9 | `offence_code` | string | JSON list of BTP offence codes |
| 10 | `created_datetime` | datetime | UTC timestamp of violation |
| 11 | `closed_datetime` | datetime | Case closure timestamp |
| 12 | `modified_datetime` | datetime | Last modification timestamp |
| 13 | `device_id` | string | Capture device ID (anonymized) |
| 14 | `created_by_id` | string | Officer ID (anonymized) |
| 15 | `center_code` | int | BTP center/zone code |
| 16 | `police_station` | string | Jurisdictional police station |
| 17 | `data_sent_to_scita` | bool | Whether sent to SCITA system |
| 18 | `junction_name` | string | Nearest BTP junction name |
| 19 | `action_taken_timestamp` | datetime | Enforcement action timestamp |
| 20 | `data_sent_to_scita_timestamp` | datetime | SCITA sync timestamp |
| 21 | `updated_vehicle_number` | string | Corrected vehicle number |
| 22 | `updated_vehicle_type` | string | Corrected vehicle type |
| 23 | `validation_status` | string | approved/pending/rejected |
| 24 | `validation_timestamp` | datetime | Validation timestamp |

## Key Violation Types
- WRONG PARKING
- NO PARKING
- PARKING IN A MAIN ROAD
- PARKING ON FOOTPATH
- PARKING NEAR BUSTOP/SCHOOL/HOSPITAL ETC
- DOUBLE PARKING
- PARKING ON CYCLE TRACK
