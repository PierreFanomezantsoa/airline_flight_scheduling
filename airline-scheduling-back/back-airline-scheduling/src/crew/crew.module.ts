import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Flight } from '../flights/entities/flight.entity';
import { User } from '../users/entities/user.entity';
import { NetworkConfigurationModule } from '../network-configuration/network-configuration.module';
import { CrewController } from './crew.controller';
import { CrewEmailNotificationService } from './crew-email-notification.service';
import { CrewNotificationGateway } from './crew-notification.gateway';
import { CrewReminderService } from './crew-reminder.service';
import { CrewService } from './crew.service';
import { CrewAssignment } from './entities/crew-assignment.entity';

@Module({
  imports: [
    NetworkConfigurationModule,
    TypeOrmModule.forFeature([CrewAssignment, Flight, User]),
  ],
  controllers: [CrewController],
  providers: [
    CrewService,
    CrewEmailNotificationService,
    CrewNotificationGateway,
    CrewReminderService,
  ],
  exports: [CrewService, TypeOrmModule],
})
export class CrewModule {}
