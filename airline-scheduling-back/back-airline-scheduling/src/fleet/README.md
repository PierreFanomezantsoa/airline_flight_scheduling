# Fleet Module Documentation

## Overview
The Fleet module manages aircraft and aircraft types for the airline scheduling system.

## Entities

### Aircraft
Represents an individual aircraft in the fleet.

**Properties:**
- `id` - UUID (unique identifier)
- `registration` - Aircraft registration number (e.g., 5R-MFT)
- `model` - Aircraft model name
- `capacity` - Passenger capacity
- `totalFlightHours` - Total accumulated flight hours
- `maintenanceHoursLimit` - Hours before mandatory maintenance
- `status` - Current status (Active, Maintenance, Out of Service, Retired)
- `lastMaintenanceDate` - Last maintenance date
- `flightsSinceLastMaintenance` - Hours since last maintenance
- `homeBase` - Home airport (e.g., TNR, CDG)
- `type` - Reference to AircraftType
- `createdAt` - Creation timestamp
- `updatedAt` - Last update timestamp
- `flights` - Related flights
- `maintenances` - Related maintenance slots

### AircraftType
Represents an aircraft model type with specifications.

**Properties:**
- `id` - UUID
- `modelName` - Aircraft model name (e.g., Boeing 737-800)
- `manufacturer` - Manufacturer name
- `maxCapacity` - Maximum passenger capacity
- `cruiseSpeed` - Cruising speed (km/h)
- `maxFlightRange` - Maximum flight range (km)
- `fuelConsumption` - Fuel consumption per hour (liters)
- `maintenanceIntervalHours` - Maintenance interval in hours
- `createdAt` - Creation timestamp
- `updatedAt` - Last update timestamp
- `aircrafts` - Related aircraft

## API Endpoints

### Aircraft Management

#### Get All Aircraft
```
GET /fleet/aircrafts
```
Returns all aircraft with their details.

#### Get Fleet Statistics
```
GET /fleet/aircrafts/statistics
```
Returns fleet statistics including:
- Total aircraft count
- Aircraft count by status
- Total and average flight hours
- Average capacity

#### Get Aircraft by Status
```
GET /fleet/aircrafts/status/:status
```
Parameters:
- `status` - One of: Active, Maintenance, Out of Service, Retired

#### Get Aircraft by Home Base
```
GET /fleet/aircrafts/home-base/:homeBase
```
Parameters:
- `homeBase` - Airport code (e.g., TNR, CDG)

#### Get Aircraft by Registration
```
GET /fleet/aircrafts/registration/:registration
```
Parameters:
- `registration` - Aircraft registration number

#### Get Aircraft by ID
```
GET /fleet/aircrafts/:id
```
Parameters:
- `id` - Aircraft UUID

#### Create Aircraft
```
POST /fleet/aircrafts
Content-Type: application/json

{
  "registration": "5R-MFT",
  "model": "Boeing 737-800",
  "capacity": 189,
  "maintenanceHoursLimit": 5000,
  "totalFlightHours": 0,
  "status": "Active",
  "homeBase": "TNR",
  "typeId": "uuid-of-type"
}
```

#### Update Aircraft
```
PATCH /fleet/aircrafts/:id
Content-Type: application/json

{
  "capacity": 200,
  "status": "Maintenance",
  "homeBase": "CDG"
}
```

#### Delete Aircraft
```
DELETE /fleet/aircrafts/:id
```

#### Update Maintenance Status
```
PATCH /fleet/aircrafts/:id/maintenance/update
Content-Type: application/json

{
  "hoursFlown": 150
}
```
Updates total flight hours and checks if maintenance is needed.

#### Reset Maintenance Counter
```
PATCH /fleet/aircrafts/:id/maintenance/reset
```
Resets maintenance counter after maintenance completion.

### Aircraft Type Management

#### Get All Aircraft Types
```
GET /fleet/types
```
Returns all aircraft types with their specifications.

#### Get Aircraft Type by ID
```
GET /fleet/types/:id
```
Parameters:
- `id` - AircraftType UUID

#### Create Aircraft Type
```
POST /fleet/types
Content-Type: application/json

{
  "modelName": "Boeing 737-800",
  "manufacturer": "Boeing",
  "maxCapacity": 189,
  "cruiseSpeed": 490,
  "maxFlightRange": 5400,
  "fuelConsumption": 5000,
  "maintenanceIntervalHours": 5000
}
```

#### Update Aircraft Type
```
PATCH /fleet/types/:id
Content-Type: application/json

{
  "maxCapacity": 200,
  "cruiseSpeed": 500
}
```

#### Delete Aircraft Type
```
DELETE /fleet/types/:id
```
Note: Cannot delete if aircraft are assigned to this type.

## DTOs

### CreateAircraftDto
Required fields:
- `registration` (string, 1-20 chars)
- `model` (string, 1-100 chars)
- `capacity` (number)
- `maintenanceHoursLimit` (number)

Optional fields:
- `totalFlightHours` (number)
- `status` (enum: Active, Maintenance, Out of Service, Retired)
- `homeBase` (string, 1-50 chars)
- `typeId` (string)

### UpdateAircraftDto
All fields are optional.

### CreateAircraftTypeDto
Required fields:
- `modelName` (string, 1-100 chars)
- `manufacturer` (string, 1-50 chars)
- `maxCapacity` (number)
- `cruiseSpeed` (number)
- `maxFlightRange` (number)
- `fuelConsumption` (number)
- `maintenanceIntervalHours` (number)

### UpdateAircraftTypeDto
All fields are optional.

## Business Rules

1. **Aircraft Registration Uniqueness**: Each aircraft must have a unique registration number.
2. **Aircraft Type Uniqueness**: Each aircraft type model name must be unique.
3. **Maintenance Tracking**: 
   - When flight hours reach `maintenanceHoursLimit`, aircraft status changes to "Maintenance"
   - After maintenance, counter is reset via the reset endpoint
4. **Type Deletion**: Cannot delete an aircraft type if aircraft are assigned to it.
5. **Status Management**: Only Active aircraft can be scheduled for flights.

## Service Methods

### Aircraft Methods
- `findAll()` - Get all aircraft
- `findOne(id)` - Get aircraft by ID
- `findByRegistration(registration)` - Get aircraft by registration
- `findByStatus(status)` - Get aircraft by status
- `findByHomeBase(homeBase)` - Get aircraft by home base
- `create(dto)` - Create new aircraft
- `update(id, dto)` - Update aircraft
- `remove(id)` - Delete aircraft
- `getFleetStatistics()` - Get fleet statistics
- `updateMaintenanceStatus(id, hoursFlown)` - Update maintenance hours
- `resetMaintenanceCounter(id)` - Reset maintenance counter

### Aircraft Type Methods
- `findAllTypes()` - Get all aircraft types
- `findOneType(id)` - Get aircraft type by ID
- `createType(dto)` - Create new aircraft type
- `updateType(id, dto)` - Update aircraft type
- `removeType(id)` - Delete aircraft type

## Error Handling

- **NotFoundException**: When aircraft or type is not found
- **BadRequestException**: 
  - When registration already exists
  - When aircraft type model already exists
  - When trying to delete type with assigned aircraft
  - When invalid status is provided

## Database Indexes

- `aircrafts.registration` - For quick lookup by registration
- `aircrafts.type` - For queries by type
- `aircraft_types.modelName` - For quick type lookup
