import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { createHmac, timingSafeEqual } from 'crypto';
import { Namespace, Socket } from 'socket.io';
import { SessionUser } from '../auth/interfaces/session-user.interface';
import { CrewAssignment } from './entities/crew-assignment.entity';
import { getCrewRoleLabel } from './utils/crew-role-label.util';

@WebSocketGateway({
  namespace: '/crew-notifications',
  cors: {
    origin: [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:5174',
      'http://127.0.0.1:5174',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'https://airline-flight.54.156.21.207.nip.io',
    ],
    credentials: true,
  },
})
export class CrewNotificationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(CrewNotificationGateway.name);

  @WebSocketServer()
  server!: Namespace;

  constructor(private readonly config: ConfigService) {}

  handleConnection(client: Socket): void {
    try {
      const token = this.extractToken(client);
      const session = this.verifyToken(token);
      client.data.session = session;
      void client.join(this.userRoom(session.refUser));
      client.emit('crew:connected', {
        connected: true,
        refUser: session.refUser,
      });
      this.logger.log(
        `Connexion temps réel équipage : ${session.refUser} (${client.id})`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Connexion WebSocket refusée (${client.id}) : ${message}`);
      client.emit('crew:notification:error', {
        message: 'Session invalide ou expirée.',
      });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const session = client.data.session as SessionUser | undefined;
    if (session?.refUser) {
      this.logger.log(
        `Déconnexion temps réel équipage : ${session.refUser} (${client.id})`,
      );
    }
  }

  async emitDepartureReminder(
    assignment: CrewAssignment,
    thresholdHours: 1 | 2,
  ): Promise<boolean> {
    const room = this.userRoom(assignment.refUser);
    const sockets = await this.server.in(room).fetchSockets();
    if (sockets.length === 0) {
      return false;
    }

    const flight = assignment.flight;
    const now = new Date();
    const remainingMinutes = Math.max(
      0,
      Math.ceil((flight.departureTime.getTime() - now.getTime()) / 60_000),
    );
    const reportTime = new Date(
      flight.departureTime.getTime() -
        this.reportBeforeDepartureMinutes * 60_000,
    );
    const crewRoleLabel = getCrewRoleLabel(String(assignment.crewRole));

    this.server.to(room).emit('crew:departure-reminder', {
      type: 'CREW_DEPARTURE_REMINDER',
      thresholdHours,
      refCrewAssign: assignment.refCrewAssign,
      refFlight: assignment.refFlight,
      flightNumber: flight.flightNumber,
      crewRole: crewRoleLabel,
      depAirportCode: flight.depAirportCode,
      arrAirportCode: flight.arrAirportCode,
      reportTime: reportTime.toISOString(),
      departureTime: flight.departureTime.toISOString(),
      arrivalTime: flight.arrivalTime.toISOString(),
      remainingMinutes,
      message:
        `Rappel : vous êtes affecté(e) au vol ${flight.flightNumber} ` +
        `en qualité de ${crewRoleLabel}. Départ dans environ ` +
        `${this.formatRemainingTime(remainingMinutes)}.`,
      emittedAt: now.toISOString(),
    });

    this.logger.log(
      `Alerte temps réel envoyée à ${assignment.refUser} pour le vol ` +
        `${flight.flightNumber} (T-${thresholdHours} h).`,
    );
    return true;
  }

  private extractToken(client: Socket): string {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.trim()) {
      return authToken.replace(/^Bearer\s+/i, '').trim();
    }

    const authorization = client.handshake.headers.authorization;
    if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
      return authorization.slice('Bearer '.length).trim();
    }

    throw new Error('Token de session absent.');
  }

  private verifyToken(token: string): SessionUser {
    const secret = this.config.get<string>('AUTH_SECRET');
    if (!secret) {
      throw new Error('AUTH_SECRET doit être configuré dans .env.');
    }

    const [encoded, signature, extra] = token.split('.');
    if (!encoded || !signature || extra) {
      throw new Error('Format de session invalide.');
    }

    const expected = createHmac('sha256', secret)
      .update(encoded)
      .digest('base64url');
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);

    if (
      actualBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(actualBuffer, expectedBuffer)
    ) {
      throw new Error('Signature de session invalide.');
    }

    let raw: unknown;
    try {
      raw = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    } catch {
      throw new Error('Contenu de session invalide.');
    }

    if (!raw || typeof raw !== 'object') {
      throw new Error('Session invalide.');
    }

    const payload = raw as Record<string, unknown>;
    const refUser = payload.sub;
    const role = payload.role;
    const exp = payload.exp;

    if (
      typeof refUser !== 'string' ||
      typeof role !== 'string' ||
      typeof exp !== 'number'
    ) {
      throw new Error('Données de session invalides.');
    }

    if (Date.now() >= exp) {
      throw new Error('Session expirée.');
    }

    return {
      refUser,
      role: role as SessionUser['role'],
      exp,
    };
  }

  private userRoom(refUser: string): string {
    return `crew-user:${refUser}`;
  }

  private get reportBeforeDepartureMinutes(): number {
    const configured = Number(
      this.config.get<string>('CREW_REPORT_BEFORE_DEPARTURE_MINUTES'),
    );
    return Number.isFinite(configured) && configured > 0 ? configured : 60;
  }

  private formatRemainingTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours <= 0) return `${mins} min`;
    if (mins === 0) return `${hours} h`;
    return `${hours} h ${mins} min`;
  }
}
