import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Flight } from '../flights/entities/flight.entity';
import { User } from '../users/entities/user.entity';
import { CrewController } from './crew.controller';
import { CrewService } from './crew.service';
import { CrewAssignment } from './entities/crew-assignment.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CrewAssignment, Flight, User])],
  controllers: [CrewController],
  providers: [CrewService],
  exports: [CrewService, TypeOrmModule],
})
export class CrewModule {}
