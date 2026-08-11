import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Aircraft } from '../fleet/entities/aircraft.entity';
import { Flight } from '../flights/entities/flight.entity';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [TypeOrmModule.forFeature([Flight, Aircraft]), SchedulingModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
