export function getShortTeamName(teamName: string): string {
  const cleaned = teamName.trim().replace(/\s+/g, ' ');
  if (!cleaned) return teamName;

  // Handle the (rare) multi-word mascot case explicitly if it ever shows up in data.
  if (cleaned.toLowerCase() === 'washington football team') return 'Football Team';

  const parts = cleaned.split(' ');
  if (parts.length <= 1) return cleaned;
  return parts[parts.length - 1];
}


