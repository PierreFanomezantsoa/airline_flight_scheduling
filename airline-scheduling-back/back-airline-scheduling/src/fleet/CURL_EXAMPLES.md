# Fleet API - cURL Examples

## Aircraft Type Operations

### Create an Aircraft Type
```bash
curl -X POST http://localhost:3000/fleet/types \
  -H "Content-Type: application/json" \
  -d '{
    "modelName": "Boeing 737-800",
    "manufacturer": "Boeing",
    "maxCapacity": 189,
    "cruiseSpeed": 490,
    "maxFlightRange": 5400,
    "fuelConsumption": 5000,
    "maintenanceIntervalHours": 5000
  }'
```

### Get All Aircraft Types
```bash
curl -X GET http://localhost:3000/fleet/types
```

### Get Aircraft Type by ID
```bash
curl -X GET http://localhost:3000/fleet/types/{id}
```

### Update Aircraft Type
```bash
curl -X PATCH http://localhost:3000/fleet/types/{id} \
  -H "Content-Type: application/json" \
  -d '{
    "maxCapacity": 200,
    "cruiseSpeed": 495
  }'
```

### Delete Aircraft Type
```bash
curl -X DELETE http://localhost:3000/fleet/types/{id}
```

---

## Aircraft Operations

### Create an Aircraft
```bash
curl -X POST http://localhost:3000/fleet/aircrafts \
  -H "Content-Type: application/json" \
  -d '{
    "registration": "5R-MFT",
    "model": "Boeing 737-800",
    "capacity": 189,
    "maintenanceHoursLimit": 5000,
    "totalFlightHours": 0,
    "status": "Active",
    "homeBase": "TNR"
  }'
```

### Get All Aircraft
```bash
curl -X GET http://localhost:3000/fleet/aircrafts
```

### Get Aircraft by ID
```bash
curl -X GET http://localhost:3000/fleet/aircrafts/{id}
```

### Get Aircraft by Registration
```bash
curl -X GET http://localhost:3000/fleet/aircrafts/registration/5R-MFT
```

### Get Aircraft by Status
```bash
# Get all Active aircraft
curl -X GET http://localhost:3000/fleet/aircrafts/status/Active

# Get all Maintenance aircraft
curl -X GET http://localhost:3000/fleet/aircrafts/status/Maintenance

# Get all Out of Service aircraft
curl -X GET http://localhost:3000/fleet/aircrafts/status/"Out%20of%20Service"

# Get all Retired aircraft
curl -X GET http://localhost:3000/fleet/aircrafts/status/Retired
```

### Get Aircraft by Home Base
```bash
curl -X GET http://localhost:3000/fleet/aircrafts/home-base/TNR
```

### Get Fleet Statistics
```bash
curl -X GET http://localhost:3000/fleet/aircrafts/statistics
```

### Update Aircraft
```bash
curl -X PATCH http://localhost:3000/fleet/aircrafts/{id} \
  -H "Content-Type: application/json" \
  -d '{
    "capacity": 200,
    "status": "Maintenance",
    "homeBase": "CDG"
  }'
```

### Update Aircraft Maintenance Status (Add Flight Hours)
```bash
curl -X PATCH http://localhost:3000/fleet/aircrafts/{id}/maintenance/update \
  -H "Content-Type: application/json" \
  -d '{
    "hoursFlown": 150
  }'
```

### Reset Maintenance Counter (After Maintenance)
```bash
curl -X PATCH http://localhost:3000/fleet/aircrafts/{id}/maintenance/reset \
  -H "Content-Type: application/json"
```

### Delete Aircraft
```bash
curl -X DELETE http://localhost:3000/fleet/aircrafts/{id}
```

---

## Response Examples

### Successful Aircraft Response
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "registration": "5R-MFT",
  "model": "Boeing 737-800",
  "capacity": 189,
  "totalFlightHours": 12500,
  "maintenanceHoursLimit": 5000,
  "status": "Active",
  "lastMaintenanceDate": "2024-01-15T10:00:00.000Z",
  "flightsSinceLastMaintenance": 250,
  "homeBase": "TNR",
  "createdAt": "2024-01-10T08:30:00.000Z",
  "updatedAt": "2024-07-05T14:20:00.000Z",
  "type": {
    "id": "660e8400-e29b-41d4-a716-446655440111",
    "modelName": "Boeing 737-800",
    "manufacturer": "Boeing",
    "maxCapacity": 189,
    "cruiseSpeed": 490,
    "maxFlightRange": 5400,
    "fuelConsumption": 5000,
    "maintenanceIntervalHours": 5000
  },
  "flights": [],
  "maintenances": []
}
```

### Successful Fleet Statistics Response
```json
{
  "totalAircrafts": 5,
  "activeAircrafts": 3,
  "inMaintenanceAircrafts": 1,
  "outOfServiceAircrafts": 0,
  "retiredAircrafts": 1,
  "totalFlightHours": 58200,
  "averageFlightHours": 11640,
  "averageCapacity": 200.6
}
```

### Error Response Example
```json
{
  "statusCode": 404,
  "message": "Aircraft with id invalid-id not found",
  "error": "Not Found"
}
```

---

## Notes

1. **Dates**: All dates are in ISO 8601 format (UTC)
2. **IDs**: UUIDs are used for all entity IDs
3. **Status Codes**:
   - 200 OK - Successful GET, PATCH, DELETE
   - 201 Created - Successful POST
   - 400 Bad Request - Invalid input or business rule violation
   - 404 Not Found - Entity not found
   - 500 Internal Server Error - Server error

4. **Authentication**: Add authentication headers if required by your setup
5. **CORS**: May need to configure CORS if calling from frontend

---

## Useful Sequences

### Complete Aircraft Lifecycle

1. Create aircraft type:
```bash
AIRCRAFT_TYPE_ID=$(curl -s -X POST http://localhost:3000/fleet/types \
  -H "Content-Type: application/json" \
  -d '{"modelName":"Boeing 737-800","manufacturer":"Boeing",...}' | jq -r '.id')
```

2. Create aircraft with type:
```bash
AIRCRAFT_ID=$(curl -s -X POST http://localhost:3000/fleet/aircrafts \
  -H "Content-Type: application/json" \
  -d "{\"registration\":\"5R-MFT\",\"typeId\":\"$AIRCRAFT_TYPE_ID\",...}" | jq -r '.id')
```

3. Update with flight hours:
```bash
curl -X PATCH http://localhost:3000/fleet/aircrafts/$AIRCRAFT_ID/maintenance/update \
  -H "Content-Type: application/json" \
  -d '{"hoursFlown":150}'
```

4. Reset maintenance after service:
```bash
curl -X PATCH http://localhost:3000/fleet/aircrafts/$AIRCRAFT_ID/maintenance/reset \
  -H "Content-Type: application/json"
```
