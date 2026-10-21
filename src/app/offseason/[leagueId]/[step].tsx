import { useLocalSearchParams } from 'expo-router';

import { WizardScreen } from '@/components/offseason/wizard-screen';

export default function OffseasonStepRoute() {
  const { leagueId, step } = useLocalSearchParams<{ leagueId: string; step: string }>();
  return <WizardScreen leagueId={leagueId} step={step} />;
}
