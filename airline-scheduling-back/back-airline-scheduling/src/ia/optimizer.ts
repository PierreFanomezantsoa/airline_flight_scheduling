import { FlightSchema } from './dto/flight-schema.dto';

export type ConflictRecord = {
  type: string;
  flight_id: string;
  description: string;
};

export type WeatherRisk = {
  flight_id: string;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  weather_alerts: string[];
};

export type OptimizedFlight = FlightSchema & {
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  weather_alerts: string[];
};

export class AirlineOptimizer {
  static detectAndResolveConflicts(
    flights: FlightSchema[],
    turnaroundMin = 45,
  ) {
    const conflicts: ConflictRecord[] = [];
    const sortedFlights = [...flights].sort((a, b) =>
      a.departure_time.localeCompare(b.departure_time),
    );
    const optimizedFlights: OptimizedFlight[] = sortedFlights.map((flight) => ({
      ...flight,
      risk_level: 'LOW',
      weather_alerts: [],
    }));

    for (let i = 0; i < optimizedFlights.length - 1; i += 1) {
      const currentFlight = optimizedFlights[i];
      const nextFlight = optimizedFlights[i + 1];

      if (currentFlight.aircraft_id === nextFlight.aircraft_id) {
        const arrivalTime = new Date(currentFlight.arrival_time);
        const departureTime = new Date(nextFlight.departure_time);
        const groundTime = (departureTime.getTime() - arrivalTime.getTime()) / 60000;

        if (groundTime < turnaroundMin) {
          const description = `Conflit sur l'appareil ${currentFlight.aircraft_id}: temps de rotation ${Math.round(
            groundTime,
          )} minutes, minimum ${turnaroundMin} minutes.`;

          conflicts.push({
            type: 'TURNAROUND_VIOLATION',
            flight_id: nextFlight.id,
            description,
          });

          const newDeparture = new Date(arrivalTime.getTime() + turnaroundMin * 60000);
          const flightDuration =
            new Date(nextFlight.arrival_time).getTime() - departureTime.getTime();
          const newArrival = new Date(newDeparture.getTime() + flightDuration);

          nextFlight.departure_time = newDeparture.toISOString();
          nextFlight.arrival_time = newArrival.toISOString();
          nextFlight.status = 'Delayed';
        }
      }
    }

    const weatherRisks = optimizedFlights.map((flight) =>
      AirlineOptimizer.predictWeatherRisk(flight),
    );

    return {
      has_conflicts: conflicts.length > 0,
      conflicts,
      optimized_flights: optimizedFlights,
      weather_risks: weatherRisks,
      summary: {
        total_flights: optimizedFlights.length,
        adjusted_flights: conflicts.length,
      },
    };
  }

  static predictWeatherRisk(flight: FlightSchema): WeatherRisk {
    const departureDate = new Date(flight.departure_time);
    const hour = departureDate.getUTCHours();
    const month = departureDate.getUTCMonth() + 1;

    const baseRisk = hour < 6 || hour >= 22 ? 'HIGH' : hour >= 20 ? 'MEDIUM' : 'LOW';
    const winterSeason = month === 12 || month === 1 || month === 2;
    const stormAlert = winterSeason ? 'Possible conditions hivernales, vérifier vélocité du vent et piste.' : '';
    const alerts = [] as string[];

    if (baseRisk === 'HIGH') {
      alerts.push('Vol de nuit: surveiller visibilité et procédures de roulage.');
    } else if (baseRisk === 'MEDIUM') {
      alerts.push('Vol tardif: vérifier météo locale et trafic.');
    }

    if (stormAlert) {
      alerts.push(stormAlert);
    }

    return {
      flight_id: flight.id,
      risk_level: (stormAlert ? 'MEDIUM' : baseRisk) as 'LOW' | 'MEDIUM' | 'HIGH',
      weather_alerts: alerts,
    };
  }
}
