import { useEffect, useMemo, useState } from 'react';
import { BellRing, Clock3, Plane, Wifi, WifiOff, X } from 'lucide-react';
import { io, type Socket } from 'socket.io-client';
import { getAuthToken } from '../Api/apiService';

type ConnectionState = 'connecting' | 'connected' | 'disconnected';

type CrewDepartureReminder = {
  type?: 'CREW_DEPARTURE_REMINDER' | string;
  thresholdHours?: 1 | 2 | number;
  refCrewAssign?: string;
  refFlight?: string;
  flightNumber?: string;
  crewRole?: string;
  depAirportCode?: string;
  arrAirportCode?: string;
  reportTime?: string;
  departureTime?: string;
  arrivalTime?: string;
  remainingMinutes?: number;
  message?: string;
  emittedAt?: string;
};

type CrewRealtimeAlertsProps = {
  enabled: boolean;
};

const DEV_SOCKET_URL = 'http://localhost:3001';

function getSocketUrl(): string {
  const configured = String(import.meta.env.VITE_SOCKET_URL ?? '').trim();
  if (configured) return configured.replace(/\/+$/, '');
  return import.meta.env.PROD ? window.location.origin : DEV_SOCKET_URL;
}

function formatDateTime(value?: string): string {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatRemainingTime(minutes?: number): string {
  if (minutes === undefined || !Number.isFinite(minutes)) return '--';
  const safeMinutes = Math.max(0, Math.ceil(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  if (hours <= 0) return `${mins} min`;
  if (mins === 0) return `${hours} h`;
  return `${hours} h ${mins} min`;
}

export default function CrewRealtimeAlerts({ enabled }: CrewRealtimeAlertsProps) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [notification, setNotification] = useState<CrewDepartureReminder | null>(null);
  const socketUrl = useMemo(() => getSocketUrl(), []);

  useEffect(() => {
    if (!enabled) {
      setConnectionState('disconnected');
      setNotification(null);
      return;
    }

    const token = getAuthToken();
    if (!token) {
      setConnectionState('disconnected');
      return;
    }

    setConnectionState('connecting');

    const socket: Socket = io(`${socketUrl}/crew-notifications`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 10_000,
      timeout: 10_000,
    });

    socket.on('connect', () => {
      setConnectionState('connected');
    });

    socket.on('disconnect', () => {
      setConnectionState('disconnected');
    });

    socket.on('connect_error', (error: Error) => {
      console.warn('[Crew WebSocket] Connexion impossible :', error.message);
      setConnectionState('disconnected');
    });

    socket.on('crew:connected', () => {
      setConnectionState('connected');
    });

    socket.on('crew:notification:error', (payload: { message?: string }) => {
      console.warn(
        '[Crew WebSocket] Notification refusée :',
        payload?.message ?? 'Erreur inconnue',
      );
    });

    socket.on('crew:departure-reminder', (payload: CrewDepartureReminder) => {
      setNotification(payload);
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [enabled, socketUrl]);

  useEffect(() => {
    if (!notification) return;
    const timer = window.setTimeout(() => setNotification(null), 30_000);
    return () => window.clearTimeout(timer);
  }, [notification]);

  if (!enabled) return null;

  return (
    <>
      <div
        className="fixed bottom-4 right-4 z-[120] hidden items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-3 py-2 text-xs font-semibold text-slate-600 shadow-lg backdrop-blur md:flex"
        title="État des alertes équipage en temps réel"
      >
        {connectionState === 'connected' ? (
          <Wifi className="h-3.5 w-3.5 text-emerald-600" />
        ) : (
          <WifiOff className="h-3.5 w-3.5 text-slate-400" />
        )}
        <span>
          {connectionState === 'connected'
            ? 'Alertes temps réel actives'
            : connectionState === 'connecting'
              ? 'Connexion aux alertes…'
              : 'Alertes temps réel hors ligne'}
        </span>
      </div>

      {notification && (
        <section
          role="alert"
          aria-live="assertive"
          className="fixed right-4 top-4 z-[150] w-[calc(100%-2rem)] max-w-md overflow-hidden rounded-3xl border border-amber-200 bg-white shadow-2xl shadow-slate-950/20 sm:right-6 sm:top-6"
        >
          <div className="flex items-start gap-3 bg-amber-50 px-4 py-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
              <BellRing className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-700">
                Rappel équipage en temps réel
              </p>
              <h2 className="mt-0.5 truncate text-base font-bold text-slate-900">
                Vol {notification.flightNumber ?? '--'}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setNotification(null)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-white hover:text-slate-900"
              aria-label="Fermer la notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4 p-4">
            <p className="text-sm leading-6 text-slate-700">
              {notification.message ??
                `Votre vol approche. Vérifiez votre programme de service et votre heure de présentation.`}
            </p>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-200/80">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                  <Plane className="h-3.5 w-3.5" />
                  Itinéraire
                </div>
                <p className="mt-1 text-sm font-bold text-slate-900">
                  {notification.depAirportCode ?? '--'} → {notification.arrAirportCode ?? '--'}
                </p>
                {notification.crewRole && (
                  <p className="mt-1 text-xs text-slate-500">{notification.crewRole}</p>
                )}
              </div>

              <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-200/80">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                  <Clock3 className="h-3.5 w-3.5" />
                  Temps restant
                </div>
                <p className="mt-1 text-sm font-bold text-amber-700">
                  {formatRemainingTime(notification.remainingMinutes)}
                </p>
                {notification.thresholdHours && (
                  <p className="mt-1 text-xs text-slate-500">
                    Seuil T−{notification.thresholdHours} h
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white px-3.5 py-3 text-xs leading-5 text-slate-600">
              <p>
                <strong className="text-slate-800">Présentation :</strong>{' '}
                {formatDateTime(notification.reportTime)}
              </p>
              <p>
                <strong className="text-slate-800">Départ :</strong>{' '}
                {formatDateTime(notification.departureTime)}
              </p>
              <p>
                <strong className="text-slate-800">Arrivée :</strong>{' '}
                {formatDateTime(notification.arrivalTime)}
              </p>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
