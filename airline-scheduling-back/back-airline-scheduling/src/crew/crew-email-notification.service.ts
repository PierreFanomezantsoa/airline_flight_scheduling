import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CrewAssignment } from './entities/crew-assignment.entity';
import { getCrewRoleLabel } from './utils/crew-role-label.util';

export type CrewNotificationResult = {
  sent: boolean;
  disabled?: boolean;
  error?: string;
};

type MailTransporter = {
  sendMail(options: Record<string, unknown>): Promise<unknown>;
};

@Injectable()
export class CrewEmailNotificationService {
  private readonly logger = new Logger(CrewEmailNotificationService.name);
  private transporter: MailTransporter | null | undefined;

  constructor(private readonly config: ConfigService) {}

  get reportBeforeDepartureMinutes(): number {
    return this.positiveNumber(
      this.config.get<string>('CREW_REPORT_BEFORE_DEPARTURE_MINUTES'),
      60,
    );
  }

  async sendAssignmentCreated(
    assignment: CrewAssignment,
  ): Promise<CrewNotificationResult> {
    const subject = `Affectation au vol ${assignment.flight.flightNumber}`;
    const body = this.buildAssignmentBody(assignment, false);
    return this.send(assignment.user.email, subject, body.text, body.html);
  }

  async sendAssignmentUpdated(
    assignment: CrewAssignment,
  ): Promise<CrewNotificationResult> {
    const subject = `Mise à jour de votre affectation - vol ${assignment.flight.flightNumber}`;
    const body = this.buildAssignmentBody(assignment, true);
    return this.send(assignment.user.email, subject, body.text, body.html);
  }

  async sendDepartureReminder(
    assignment: CrewAssignment,
    thresholdHours: 1 | 2,
  ): Promise<CrewNotificationResult> {
    const flight = assignment.flight;
    const now = new Date();
    const remainingMinutes = Math.max(
      0,
      Math.ceil((flight.departureTime.getTime() - now.getTime()) / 60_000),
    );
    const subject = `Rappel équipage - vol ${flight.flightNumber} dans moins de ${thresholdHours} h`;
    const reportTime = this.getReportingTime(flight.departureTime);
    const crewRoleLabel = getCrewRoleLabel(String(assignment.crewRole));

    const text = [
      `Bonjour ${assignment.user.userName},`,
      '',
      `Rappel : vous êtes affecté(e) au vol ${flight.flightNumber} en qualité de ${crewRoleLabel}.`,
      `Vol : ${flight.flightNumber}`,
      `Fonction : ${crewRoleLabel}`,
      `Itinéraire : ${flight.depAirportCode} -> ${flight.arrAirportCode}`,
      `Heure de présentation estimée : ${this.formatUtc(reportTime)}`,
      `Départ prévu : ${this.formatUtc(flight.departureTime)}`,
      `Arrivée prévue : ${this.formatUtc(flight.arrivalTime)}`,
      `Temps restant avant le départ : environ ${this.formatRemainingTime(remainingMinutes)}.`,
      '',
      'Merci de vérifier votre programme de service et de vous conformer aux consignes opérationnelles applicables.',
      '',
      'Airline Flight Scheduling',
    ].join('\n');

    const html = `
      <p>Bonjour <strong>${this.escapeHtml(assignment.user.userName)}</strong>,</p>
      <p><strong>Rappel :</strong> vous êtes affecté(e) au vol <strong>${this.escapeHtml(
        flight.flightNumber,
      )}</strong> en qualité de <strong>${this.escapeHtml(crewRoleLabel)}</strong>.</p>
      <ul>
        <li><strong>Vol :</strong> ${this.escapeHtml(flight.flightNumber)}</li>
        <li><strong>Fonction :</strong> ${this.escapeHtml(crewRoleLabel)}</li>
        <li><strong>Itinéraire :</strong> ${this.escapeHtml(
          flight.depAirportCode,
        )} → ${this.escapeHtml(flight.arrAirportCode)}</li>
        <li><strong>Heure de présentation estimée :</strong> ${this.escapeHtml(
          this.formatUtc(reportTime),
        )}</li>
        <li><strong>Départ prévu :</strong> ${this.escapeHtml(
          this.formatUtc(flight.departureTime),
        )}</li>
        <li><strong>Arrivée prévue :</strong> ${this.escapeHtml(
          this.formatUtc(flight.arrivalTime),
        )}</li>
        <li><strong>Temps restant avant le départ :</strong> environ ${this.escapeHtml(
          this.formatRemainingTime(remainingMinutes),
        )}</li>
      </ul>
      <p>Merci de vérifier votre programme de service et de vous conformer aux consignes opérationnelles applicables.</p>
      <p><strong>Airline Flight Scheduling</strong></p>
    `;

    return this.send(assignment.user.email, subject, text, html);
  }

  private buildAssignmentBody(
    assignment: CrewAssignment,
    updated: boolean,
  ): { text: string; html: string } {
    const flight = assignment.flight;
    const reportTime = this.getReportingTime(flight.departureTime);
    const crewRoleLabel = getCrewRoleLabel(String(assignment.crewRole));
    const intro = updated
      ? 'Votre affectation équipage a été mise à jour.'
      : 'Vous avez été affecté(e) à un vol.';

    const text = [
      `Bonjour ${assignment.user.userName},`,
      '',
      intro,
      `Vol : ${flight.flightNumber}`,
      `Fonction : ${crewRoleLabel}`,
      `Itinéraire : ${flight.depAirportCode} -> ${flight.arrAirportCode}`,
      `Heure de présentation estimée : ${this.formatUtc(reportTime)}`,
      `Départ prévu : ${this.formatUtc(flight.departureTime)}`,
      `Arrivée prévue : ${this.formatUtc(flight.arrivalTime)}`,
      '',
      'Des rappels automatiques pourront être envoyés à l’approche du départ.',
      'Veuillez consulter votre programme de service pour toute instruction complémentaire.',
      '',
      'Airline Flight Scheduling',
    ].join('\n');

    const html = `
      <p>Bonjour <strong>${this.escapeHtml(assignment.user.userName)}</strong>,</p>
      <p>${this.escapeHtml(intro)}</p>
      <ul>
        <li><strong>Vol :</strong> ${this.escapeHtml(flight.flightNumber)}</li>
        <li><strong>Fonction :</strong> ${this.escapeHtml(crewRoleLabel)}</li>
        <li><strong>Itinéraire :</strong> ${this.escapeHtml(
          flight.depAirportCode,
        )} → ${this.escapeHtml(flight.arrAirportCode)}</li>
        <li><strong>Heure de présentation estimée :</strong> ${this.escapeHtml(
          this.formatUtc(reportTime),
        )}</li>
        <li><strong>Départ prévu :</strong> ${this.escapeHtml(
          this.formatUtc(flight.departureTime),
        )}</li>
        <li><strong>Arrivée prévue :</strong> ${this.escapeHtml(
          this.formatUtc(flight.arrivalTime),
        )}</li>
      </ul>
      <p>Des rappels automatiques pourront être envoyés à l’approche du départ.</p>
      <p>Veuillez consulter votre programme de service pour toute instruction complémentaire.</p>
      <p><strong>Airline Flight Scheduling</strong></p>
    `;

    return { text, html };
  }

  private async send(
    to: string,
    subject: string,
    text: string,
    html: string,
  ): Promise<CrewNotificationResult> {
    const transporter = this.getTransporter();
    const from =
      this.config.get<string>('SMTP_FROM') ??
      this.config.get<string>('SMTP_USER');

    if (!transporter || !from) {
      return {
        sent: false,
        disabled: true,
        error:
          'Notifications e-mail désactivées : configuration SMTP absente ou nodemailer non installé.',
      };
    }

    try {
      await transporter.sendMail({ from, to, subject, text, html });
      this.logger.log(`Notification équipage envoyée à ${to} : ${subject}`);
      return { sent: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Échec d'envoi vers ${to}: ${message}`);
      return { sent: false, error: message };
    }
  }

  private getTransporter(): MailTransporter | null {
    if (this.transporter !== undefined) {
      return this.transporter;
    }

    const host = this.config.get<string>('SMTP_HOST');
    const port = this.positiveNumber(
      this.config.get<string>('SMTP_PORT'),
      587,
    );
    const secure = this.booleanValue(
      this.config.get<string>('SMTP_SECURE'),
      port === 465,
    );
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');

    if (!host) {
      this.logger.warn(
        'SMTP_HOST absent : les notifications équipage ne seront pas envoyées.',
      );
      this.transporter = null;
      return null;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const nodemailer = require('nodemailer') as {
        createTransport(
          options: Record<string, unknown>,
        ): MailTransporter;
      };

      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: user && pass ? { user, pass } : undefined,
      });

      return this.transporter;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Impossible d'initialiser nodemailer : ${message}`);
      this.transporter = null;
      return null;
    }
  }

  private getReportingTime(departureTime: Date): Date {
    return new Date(
      departureTime.getTime() -
        this.reportBeforeDepartureMinutes * 60_000,
    );
  }

  private formatUtc(value: Date): string {
    return `${new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'UTC',
    }).format(value)} UTC`;
  }

  private formatRemainingTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    if (hours <= 0) {
      return `${mins} min`;
    }

    if (mins === 0) {
      return `${hours} h`;
    }

    return `${hours} h ${mins} min`;
  }

  private positiveNumber(
    value: string | undefined,
    fallback: number,
  ): number {
    const parsed = Number(value);

    return Number.isFinite(parsed) && parsed > 0
      ? parsed
      : fallback;
  }

  private booleanValue(
    value: string | undefined,
    fallback: boolean,
  ): boolean {
    if (value === undefined) {
      return fallback;
    }

    return value.trim().toLowerCase() === 'true';
  }

  private escapeHtml(value: string): string {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}