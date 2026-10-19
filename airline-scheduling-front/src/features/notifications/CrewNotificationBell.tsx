import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  CheckCheck,
  Clock3,
  Plane,
  Trash2,
  UserRound,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { io, type Socket } from 'socket.io-client';
import { getAuthSession } from '../Api/apiService';

type CrewNotificationBellProps = {
  userRef: string;
};

type CrewReminderPayload = {
  id?: string;
  message?: string;
  flightNumber?: string;
  thresholdHours?: number;
  crewRole?: string;
  reportTime?: string;
  departureTime?: string;
  arrivalTime?: string;
  remainingMinutes?: number;
  createdAt?: string;
  flight?: {
    flightNumber?: string;
    departureTime?: string;
    arrivalTime?: string;
  };
};

type CrewNotification = {
  id: string;
  title: string;
  message: string;
  flightNumber: string;
  thresholdHours?: number;
  crewRole?: string;
  reportTime?: string;
  departureTime?: string;
  arrivalTime?: string;
  remainingMinutes?: number;
  createdAt: string;
  read: boolean;
};

type AuthSessionLike = {
  token?: string;
  accessToken?: string;
  access_token?: string;
};

const MAX_NOTIFICATIONS = 20;

function getSocketBaseUrl(): string {
  const configuredUrl = String(
    import.meta.env.VITE_API_URL ?? '',
  ).trim();

  if (configuredUrl) {
    return configuredUrl
      .replace(/\/api\/?$/i, '')
      .replace(/\/$/, '');
  }

  if (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  ) {
    return 'http://localhost:3001';
  }

  return window.location.origin;
}

function getSessionToken(): string | undefined {
  const session =
    getAuthSession() as AuthSessionLike | null;

  return (
    session?.accessToken ??
    session?.token ??
    session?.access_token
  );
}

function notificationStorageKey(
  userRef: string,
): string {
  return `airline.crew.notifications.${userRef}`;
}

// configuration de la traduction des rôles d'équipage en français
function translateCrewRole(
  role?: string,
): string | undefined {
  if (!role) return undefined;

  const roles: Record<string, string> = {
    CAPTAIN: 'Commandant de bord',
    COMMANDER: 'Commandant de bord',
    PILOT: 'Pilote',
    FIRST_OFFICER: 'Copilote',
    COPILOT: 'Copilote',
    CO_PILOT: 'Copilote',
    PURSER: 'Chef de cabine',
    CABIN_CHIEF: 'Chef de cabine',
    CHIEF_PURSER: 'Chef de cabine principal',
    FLIGHT_ATTENDANT: 'Personnel de cabine',
    CABIN_CREW: 'Personnel navigant commercial',
    CABIN_CREW_MEMBER:
      'Personnel navigant commercial',
    STEWARD: 'Steward',
    HOSTESS: 'Hôtesse de l’air',
  };

  const normalizedRole = role
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');

  return roles[normalizedRole] ?? role;
}

function formatReceivedAt(
  value: string,
): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'À l’instant';
  }

  const now = new Date();

  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  const isYesterday =
    date.getFullYear() ===
      yesterday.getFullYear() &&
    date.getMonth() ===
      yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  const time =
    new Intl.DateTimeFormat('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);

  if (sameDay) {
    return `Aujourd’hui à ${time}`;
  }

  if (isYesterday) {
    return `Hier à ${time}`;
  }

  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatDateTime(
  value?: string,
): string | undefined {
  if (!value) return undefined;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatRemainingTime(
  minutes?: number,
): string | undefined {
  if (
    minutes === undefined ||
    !Number.isFinite(minutes) ||
    minutes < 0
  ) {
    return undefined;
  }

  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);

  if (hours === 0) {
    return `${mins} min`;
  }

  if (mins === 0) {
    return `${hours} h`;
  }

  return `${hours} h ${mins} min`;
}

function createNotification(
  payload: CrewReminderPayload,
): CrewNotification {
  const flightNumber =
    payload.flightNumber ??
    payload.flight?.flightNumber ??
    'Vol à venir';

  const departureTime =
    payload.departureTime ??
    payload.flight?.departureTime;

  const arrivalTime =
    payload.arrivalTime ??
    payload.flight?.arrivalTime;

  const thresholdText =
    payload.thresholdHours
      ? ` dans moins de ${payload.thresholdHours} h`
      : '';

  const fallbackMessage =
    `Votre prise de service pour le vol ` +
    `${flightNumber} approche${thresholdText}.`;

  const id =
    payload.id ??
    [
      flightNumber,
      payload.thresholdHours ?? 'rappel',
      departureTime ??
        payload.createdAt ??
        'inconnu',
    ].join('-');

  return {
    id,
    title: 'Rappel de prise de service',
    message:
      payload.message?.trim() ||
      fallbackMessage,
    flightNumber,
    thresholdHours:
      payload.thresholdHours,
    crewRole: translateCrewRole(
      payload.crewRole,
    ),
    reportTime: payload.reportTime,
    departureTime,
    arrivalTime,
    remainingMinutes:
      payload.remainingMinutes,
    createdAt:
      payload.createdAt ??
      new Date().toISOString(),
    read: false,
  };
}

function loadNotifications(
  userRef: string,
): CrewNotification[] {
  try {
    const raw = localStorage.getItem(
      notificationStorageKey(userRef),
    );

    if (!raw) return [];

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(
        (
          item,
        ): item is CrewNotification =>
          Boolean(
            item &&
              typeof item === 'object' &&
              typeof item.id === 'string' &&
              typeof item.flightNumber ===
                'string' &&
              typeof item.createdAt ===
                'string',
          ),
      )
      .slice(0, MAX_NOTIFICATIONS);
  } catch {
    return [];
  }
}

export default function CrewNotificationBell({
  userRef,
}: CrewNotificationBellProps) {
  const containerRef =
    useRef<HTMLDivElement>(null);

  const socketRef =
    useRef<Socket | null>(null);

  const [isOpen, setIsOpen] =
    useState(false);

  const [
    isConnected,
    setIsConnected,
  ] = useState(false);

  const [
    notifications,
    setNotifications,
  ] = useState<CrewNotification[]>(
    () => loadNotifications(userRef),
  );

  const unreadCount = useMemo(
    () =>
      notifications.filter(
        (notification) =>
          !notification.read,
      ).length,
    [notifications],
  );

  useEffect(() => {
    setNotifications(
      loadNotifications(userRef),
    );

    setIsOpen(false);
  }, [userRef]);

  useEffect(() => {
    try {
      localStorage.setItem(
        notificationStorageKey(userRef),
        JSON.stringify(
          notifications.slice(
            0,
            MAX_NOTIFICATIONS,
          ),
        ),
      );
    } catch {
      // Le stockage local ne doit pas bloquer l'application.
    }
  }, [notifications, userRef]);

  useEffect(() => {
    const token = getSessionToken();

    const socket = io(
      `${getSocketBaseUrl()}/crew-notifications`,
      {
        auth: token
          ? { token }
          : undefined,
        withCredentials: true,
        transports: [
          'websocket',
          'polling',
        ],
        reconnection: true,
        reconnectionAttempts:
          Infinity,
        reconnectionDelay: 1000,
        timeout: 10000,
      },
    );

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on(
      'connect_error',
      () => {
        setIsConnected(false);
      },
    );

    socket.on(
      'crew:departure-reminder',
      (
        payload: CrewReminderPayload,
      ) => {
        const notification =
          createNotification(payload);

        setNotifications(
          (current) => {
            const alreadyExists =
              current.some(
                (item) =>
                  item.id ===
                  notification.id,
              );

            if (alreadyExists) {
              return current;
            }

            return [
              notification,
              ...current,
            ].slice(
              0,
              MAX_NOTIFICATIONS,
            );
          },
        );
      },
    );

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [userRef]);

  useEffect(() => {
    const handleOutsideClick = (
      event: MouseEvent,
    ) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(
          event.target as Node,
        )
      ) {
        setIsOpen(false);
      }
    };

    const handleEscape = (
      event: KeyboardEvent,
    ) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener(
      'mousedown',
      handleOutsideClick,
    );

    document.addEventListener(
      'keydown',
      handleEscape,
    );

    return () => {
      document.removeEventListener(
        'mousedown',
        handleOutsideClick,
      );

      document.removeEventListener(
        'keydown',
        handleEscape,
      );
    };
  }, []);

  const markAllAsRead = () => {
    setNotifications(
      (current) =>
        current.map(
          (notification) => ({
            ...notification,
            read: true,
          }),
        ),
    );
  };

  const markAsRead = (
    id: string,
  ) => {
    setNotifications(
      (current) =>
        current.map(
          (notification) =>
            notification.id === id
              ? {
                  ...notification,
                  read: true,
                }
              : notification,
        ),
    );
  };

  const clearNotifications = () => {
    setNotifications([]);
  };

  return (
    <div
      ref={containerRef}
      className="relative"
    >
      <button
        type="button"
        onClick={() =>
          setIsOpen(
            (previous) =>
              !previous,
          )
        }
        aria-expanded={isOpen}
        aria-label={
          unreadCount > 0
            ? `${unreadCount} notification${
                unreadCount > 1
                  ? 's'
                  : ''
              } non lue${
                unreadCount > 1
                  ? 's'
                  : ''
              }`
            : 'Notifications équipage'
        }
        className={`relative flex h-10 w-10 items-center justify-center rounded-xl bg-transparent text-slate-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 ${
          isOpen
            ? 'bg-emerald-50 text-emerald-700'
            : 'hover:bg-emerald-50 hover:text-emerald-700'
        }`}
      >
        <Bell
          className={`h-[18px] w-[18px] ${
            unreadCount > 0
              ? 'animate-[pulse_1.5s_ease-in-out_2]'
              : ''
          }`}
        />

        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
            {unreadCount > 9
              ? '9+'
              : unreadCount}
          </span>
        )}
      </button>

      <span
        className="sr-only"
        aria-live="polite"
      >
        {unreadCount > 0
          ? `${unreadCount} nouvelle notification équipage`
          : ''}
      </span>

      {isOpen && (
        <section
          role="dialog"
          aria-label="Notifications équipage"
          className="fixed inset-x-3 top-[4.25rem] z-[70] flex max-h-[calc(100dvh-5rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/10 md:absolute md:inset-x-auto md:right-0 md:top-auto md:mt-2 md:w-[380px] md:max-w-[calc(100vw-2rem)]"
        >
          <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3.5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900">
                  Notifications équipage
                </h2>

                {unreadCount > 0 && (
                  <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-600 ring-1 ring-rose-100">
                    {unreadCount} non lue
                    {unreadCount > 1
                      ? 's'
                      : ''}
                  </span>
                )}
              </div>

              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
                {isConnected ? (
                  <>
                    <Wifi className="h-3.5 w-3.5 text-emerald-500" />
                    Service de notifications actif
                  </>
                ) : (
                  <>
                    <WifiOff className="h-3.5 w-3.5 text-slate-400" />
                    Connexion aux notifications en cours
                  </>
                )}
              </div>
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-50"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Tout marquer comme lu
              </button>
            )}
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain md:max-h-[440px]">
            {notifications.length ===
            0 ? (
              <div className="px-6 py-10 text-center">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-50 text-slate-400">
                  <Bell className="h-5 w-5" />
                </div>

                <p className="mt-3 text-sm font-semibold text-slate-700">
                  Aucun rappel à consulter
                </p>

                <p className="mx-auto mt-1 max-w-[250px] text-xs leading-5 text-slate-500">
                  Les rappels liés à vos prochaines affectations apparaîtront ici.
                </p>
              </div>
            ) : (
              notifications.map(
                (notification) => {
                  const reportTime =
                    formatDateTime(
                      notification.reportTime,
                    );

                  const departureTime =
                    formatDateTime(
                      notification.departureTime,
                    );

                  const remainingTime =
                    formatRemainingTime(
                      notification.remainingMinutes,
                    );

                  return (
                    <button
                      key={
                        notification.id
                      }
                      type="button"
                      onClick={() =>
                        markAsRead(
                          notification.id,
                        )
                      }
                      className={`flex w-full gap-3 border-b border-slate-100 px-4 py-3.5 text-left transition last:border-b-0 hover:bg-slate-50 ${
                        notification.read
                          ? 'bg-white'
                          : 'bg-emerald-50/45'
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                          notification.read
                            ? 'bg-slate-100 text-slate-500'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        <Plane className="h-4 w-4" />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-3">
                          <span className="truncate text-[12px] font-bold text-slate-900">
                            {
                              notification.title
                            }
                          </span>

                          {!notification.read && (
                            <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                          )}
                        </span>

                        <span className="mt-0.5 block text-[11px] font-semibold text-emerald-700">
                          Vol{' '}
                          {
                            notification.flightNumber
                          }

                          {notification.thresholdHours
                            ? ` · T−${notification.thresholdHours} h`
                            : ''}
                        </span>

                        <span className="mt-1 block text-xs leading-5 text-slate-600">
                          {
                            notification.message
                          }
                        </span>

                        {(notification.crewRole ||
                          reportTime ||
                          departureTime ||
                          remainingTime) && (
                          <span className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 rounded-xl bg-slate-50 px-3 py-2 text-[10px] leading-4 text-slate-500">
                            {notification.crewRole && (
                              <span className="flex items-center gap-1.5">
                                <UserRound className="h-3 w-3 shrink-0 text-slate-400" />

                                <span className="truncate">
                                  {
                                    notification.crewRole
                                  }
                                </span>
                              </span>
                            )}

                            {remainingTime && (
                              <span className="flex items-center gap-1.5">
                                <Clock3 className="h-3 w-3 shrink-0 text-slate-400" />

                                <span>
                                  Dans{' '}
                                  {
                                    remainingTime
                                  }
                                </span>
                              </span>
                            )}

                            {reportTime && (
                              <span className="col-span-2">
                                Présentation :{' '}
                                <strong className="font-semibold text-slate-600">
                                  {
                                    reportTime
                                  }
                                </strong>
                              </span>
                            )}

                            {departureTime && (
                              <span className="col-span-2">
                                Départ :{' '}
                                <strong className="font-semibold text-slate-600">
                                  {
                                    departureTime
                                  }
                                </strong>
                              </span>
                            )}
                          </span>
                        )}

                        <span className="mt-2 flex items-center gap-1 text-[10px] text-slate-400">
                          <Clock3 className="h-3 w-3" />

                          {formatReceivedAt(
                            notification.createdAt,
                          )}
                        </span>
                      </span>
                    </button>
                  );
                },
              )
            )}
          </div>

          {notifications.length >
            0 && (
            <footer className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-4 py-2.5">
              <span className="text-[10px] text-slate-400">
                {
                  notifications.length
                }{' '}
                notification
                {notifications.length >
                1
                  ? 's'
                  : ''}{' '}
                conservée
                {notifications.length >
                1
                  ? 's'
                  : ''}
              </span>

              <button
                type="button"
                onClick={
                  clearNotifications
                }
                className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] font-semibold text-slate-500 transition hover:bg-white hover:text-rose-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Effacer
              </button>
            </footer>
          )}
        </section>
      )}
    </div>
  );
}