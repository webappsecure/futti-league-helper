import { ArrivalsSection } from '@/components/offseason/arrivals-section';
import { ThemedText } from '@/components/themed-text';
import type { League } from '@/leagues/league';
import type { useArrivalStatus } from '@/offseason/use-arrival-status';

interface ArrivalsStepProps {
  league: League;
  hasPlan: boolean;
  arrivals: ReturnType<typeof useArrivalStatus>;
}

/** Teams moving in from the linked leagues; says so when there are no linked leagues. */
export function ArrivalsStep({ league, hasPlan, arrivals }: ArrivalsStepProps) {
  const { state } = arrivals;
  if (state.status === 'ready' && state.arrivals.sources.length === 0 && state.arrivals.blocked.length === 0) {
    return <ThemedText>No teams are moving in from linked leagues.</ThemedText>;
  }
  return <ArrivalsSection league={league} hasPlan={hasPlan} arrivals={arrivals} />;
}
