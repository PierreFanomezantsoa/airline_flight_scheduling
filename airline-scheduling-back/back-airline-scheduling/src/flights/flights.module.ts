import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Flight } from './entities/flight.entity';
import { CrewAssignment } from './entities/crew-assignment.entity';
import { FlightsController } from './flights.controller';
import { FlightsService } from './flights.service';
import { CrewAssignmentsController } from './crew-assignments.controller';
import { CrewAssignmentsService } from './crew-assignments.service';
import { Aircraft } from '../fleet/entities/aircraft.entity';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Flight, CrewAssignment, Aircraft, User]),
  ],
  controllers: [
    FlightsController, 
    CrewAssignmentsController,
  ],
  providers: [
    FlightsService, 
    CrewAssignmentsService,
  ],
  exports: [
    FlightsService, 
    CrewAssignmentsService,
  ],
})
export class FlightsModule {}