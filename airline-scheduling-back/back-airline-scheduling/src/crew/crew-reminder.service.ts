import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FlightStatus } from '../common/enums/airline.enums';
import { CrewEmailNotificationService } from './crew-email-notification.service';
import { CrewNotificationGateway } from './crew-notification.gateway';
import { CrewAssignment } from './entities/crew-assignment.entity';

@Injectable()
export class CrewReminderService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(CrewReminderService.name);
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;

  constructor(
    @InjectRepository(CrewAssignment)
    private readonly assignmentRepository: Repository<CrewAssignment>,
    private readonly emailNotificationService: CrewEmailNotificationService,
    private readonly realtimeNotificationGateway: CrewNotificationGateway,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    const intervalMs = this.positiveNumber(
      this.config.get<string>('CREW_REMINDER_CHECK_INTERVAL_MS'),
      300_000,
    );

    this.timer = setInterval(() => {
      void this.processUpcomingFlights();
    }, intervalMs);

    setTimeout(() => void this.processUpcomingFlights(), 5_000);
    this.logger.log(
      `Surveillance des rappels équipage active (intervalle ${Math.round(intervalMs / 1000)} s).`,
    );
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async processUpcomingFlights(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      const now = new Date();
      const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      const assignments = await this.assignmentRepository
        .createQueryBuilder('assignment')
        .innerJoinAndSelect('assignment.flight', 'flight')
        .innerJoinAndSelect('assignment.user', 'user')
        .where('flight.departureTime > :now', { now })
        .andWhere('flight.departureTime <= :twoHoursFromNow', { twoHoursFromNow })
        .andWhere('flight.flightStatus != :cancelled', {
          cancelled: FlightStatus.CANCELLED,
        })
        .andWhere('user.isActive = true')
        .getMany();

      for (const assignment of assignments) {
        await this.processAssignment(assignment, now);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Erreur pendant le traitement des rappels équipage : ${message}`);
    } finally {
      this.running = false;
    }
  }

  private async processAssignment(
    assignment: CrewAssignment,
    now: Date,
  ): Promise<void> {
    const remainingMinutes =
      (assignment.flight.departureTime.getTime() - now.getTime()) / 60_000;

    if (
      remainingMinutes > 60 &&
      remainingMinutes <= 120 &&
      !assignment.reminder2hSentAt
    ) {
      await this.deliverReminder(assignment, 2);
      return;
    }

    if (
      remainingMinutes > 0 &&
      remainingMinutes <= 60 &&
      !assignment.reminder1hSentAt
    ) {
      await this.deliverReminder(assignment, 1);
    }
  }

  private async deliverReminder(
    assignment: CrewAssignment,
    thresholdHours: 1 | 2,
  ): Promise<void> {
    const [emailResult, realtimeSent] = await Promise.all([
      this.emailNotificationService.sendDepartureReminder(
        assignment,
        thresholdHours,
      ),
      this.realtimeNotificationGateway.emitDepartureReminder(
        assignment,
        thresholdHours,
      ),
    ]);

    if (emailResult.sent || realtimeSent) {
      const sentAt = new Date();
      if (thresholdHours === 2) {
        assignment.reminder2hSentAt = sentAt;
      } else {
        assignment.reminder1hSentAt = sentAt;
      }
      assignment.lastNotificationError = emailResult.sent
        ? null
        : emailResult.error?.slice(0, 500) ?? null;
      await this.assignmentRepository.save(assignment);
      return;
    }

    if (!emailResult.disabled && emailResult.error) {
      assignment.lastNotificationError = emailResult.error.slice(0, 500);
      await this.assignmentRepository.save(assignment);
    }
  }

  private positiveNumber(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
