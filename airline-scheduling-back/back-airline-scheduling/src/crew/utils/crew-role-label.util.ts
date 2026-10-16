export function getCrewRoleLabel(role: string): string {
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
    CABIN_CREW_MEMBER: 'Personnel navigant commercial',
    STEWARD: 'Steward',
    HOSTESS: 'Hôtesse de l’air',
    OTHER: 'Autre',
  };

  const normalizedRole = String(role)
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');

  return roles[normalizedRole] ?? role;
}
