import { Redirect, router, type Href } from 'expo-router';

import { Button } from '@/components/button';
import { ApprovalStep } from '@/components/offseason/approval-step';
import { AgingStep } from '@/components/offseason/aging-step';
import { ArrivalsStep } from '@/components/offseason/arrivals-step';
import { FreeAgencyStep } from '@/components/offseason/free-agency-step';
import { DeparturesStep } from '@/components/offseason/departures-step';
import { NewTeamsSection } from '@/components/offseason/new-teams-section';
import { OrderStep } from '@/components/offseason/order-step';
import { RookieDraftStep } from '@/components/offseason/rookie-draft-step';
import { ProgressionStep } from '@/components/offseason/progression-step';
import { ProtectionStep } from '@/components/offseason/protection-step';
import { WizardMessage, WizardShell } from '@/components/offseason/wizard-shell';
import { ThemedText } from '@/components/themed-text';
import { Accent } from '@/constants/theme';
import { displayName } from '@/teams/franchise';
import type { ParticipatingTeam } from '@/offseason/roster-changes';
import type { League } from '@/leagues/league';
import { useOffseasonData, useWizardLeague } from '@/offseason/use-offseason-data';
import { canOpenStep, firstIncompleteStep, isWizardStep, type WizardStep } from '@/offseason/wizard';
import type { Season } from '@/seasons/season';
import { useLeagueSeason } from '@/seasons/use-league-season';

// Cast: the generated route types are rebuilt by `expo start`, so they can lag behind new route files.
const stepHref = (leagueId: string, step: WizardStep) => `/offseason/${leagueId}/${step}` as Href;

/** Back to the Leagues tab, which keeps its selected league. */
const exit = () => (router.canGoBack() ? router.back() : router.replace('/'));

const ExitButton = () => <Button label="Back to league" onPress={exit} />;
const errorStyle = { color: Accent.danger };

/** The wizard route: finds the league, checks it is in its offseason, then shows the step named in the URL. */
export function WizardScreen({ leagueId, step }: { leagueId: string; step: string }) {
  const found = useWizardLeague(leagueId);
  if (!isWizardStep(step)) {
    return (
      <WizardMessage actions={<ExitButton />}>
        <ThemedText accessibilityRole="alert">That offseason step does not exist.</ThemedText>
      </WizardMessage>
    );
  }
  switch (found.state.status) {
    case 'loading':
      return (
        <WizardMessage>
          <ThemedText>Loading...</ThemedText>
        </WizardMessage>
      );
    case 'error':
      return (
        <WizardMessage actions={<><Button label="Retry" onPress={found.retry} /><ExitButton /></>}>
          <ThemedText accessibilityRole="alert" style={errorStyle}>
            Could not load the league. {found.state.message}
          </ThemedText>
        </WizardMessage>
      );
    case 'missing':
      return (
        <WizardMessage actions={<ExitButton />}>
          <ThemedText accessibilityRole="alert">This league no longer exists.</ThemedText>
        </WizardMessage>
      );
    case 'ready':
      return <WizardSeason league={found.state.league} step={step} />;
  }
}

function WizardSeason({ league, step }: { league: League; step: WizardStep }) {
  const season = useLeagueSeason(league);
  if (season.state.status === 'loading') {
    return (
      <WizardMessage>
        <ThemedText>Loading...</ThemedText>
      </WizardMessage>
    );
  }
  if (season.state.status === 'error') {
    return (
      <WizardMessage actions={<><Button label="Retry" onPress={season.retry} /><ExitButton /></>}>
        <ThemedText accessibilityRole="alert" style={errorStyle}>
          Could not load the season. {season.state.message}
        </ThemedText>
      </WizardMessage>
    );
  }
  const current = season.state.season;
  if (current === null || current.status !== 'offseason') {
    return (
      <WizardMessage actions={<ExitButton />}>
        <ThemedText accessibilityRole="alert">{league.name} is not in its offseason, so there is nothing to do here.</ThemedText>
      </WizardMessage>
    );
  }
  return <WizardStepScreen league={league} season={current} step={step} />;
}

function WizardStepScreen({ league, season, step }: { league: League; season: Season; step: WizardStep }) {
  const { data, arrivals, refresh, retry } = useOffseasonData(league, season);
  if (data.status === 'loading') {
    return (
      <WizardMessage>
        <ThemedText>Loading...</ThemedText>
      </WizardMessage>
    );
  }
  if (data.status === 'error') {
    return (
      <WizardMessage actions={<><Button label="Retry" onPress={retry} /><ExitButton /></>}>
        <ThemedText accessibilityRole="alert" style={errorStyle}>
          Could not load the offseason. {data.message}
        </ThemedText>
      </WizardMessage>
    );
  }
  if (data.status === 'no-archive') {
    return (
      <WizardMessage actions={<ExitButton />}>
        <ThemedText accessibilityRole="alert" style={errorStyle}>
          The saved results for this season could not be found.
        </ThemedText>
      </WizardMessage>
    );
  }
  if (!canOpenStep(step, data.statuses)) {
    return <Redirect href={stepHref(league.id, firstIncompleteStep(data.statuses) ?? 'order')} />;
  }

  const status = arrivals.state.status === 'ready' ? arrivals.state.arrivals : null;
  const nameOf = (team: ParticipatingTeam) => {
    const teamsOf = team.origin === 'staying' ? data.archive.teams : (status?.sources ?? []).flatMap((s) => s.archive?.teams ?? []);
    const found = teamsOf.find((t) => t.franchiseId === team.franchiseId);
    return found ? displayName(found.identity, league.namingStyle) : 'Unknown team';
  };

  return (
    <WizardShell
      leagueName={league.name}
      step={step}
      statuses={data.statuses}
      onGoToStep={(next) => router.replace(stepHref(league.id, next))}
      onExit={exit}>
      {step === 'order' && <OrderStep league={league} archive={data.archive} refresh={refresh} />}
      {step === 'departures' && <DeparturesStep league={league} season={season} archive={data.archive} plan={data.plan} refresh={refresh} />}
      {step === 'arrivals' && <ArrivalsStep league={league} hasPlan={data.plan !== null} arrivals={arrivals} refresh={refresh} />}
      {step === 'new-teams' && <NewTeamsSection league={league} plan={data.plan} arrivals={arrivals} refresh={refresh} />}
      {step === 'protection' && data.plan !== null && status !== null && (
        <ProtectionStep league={league} plan={data.plan} teams={data.teams} arrivals={status} nameOf={nameOf} refresh={refresh} />
      )}
      {step === 'aging' && data.plan !== null && status !== null && (
        <AgingStep league={league} plan={data.plan} teams={data.teams} arrivals={status} nameOf={nameOf} refresh={refresh} />
      )}
      {step === 'free-agency' && data.plan !== null && status !== null && (
        <FreeAgencyStep league={league} archive={data.archive} plan={data.plan} teams={data.teams} arrivals={status} nameOf={nameOf} refresh={refresh} />
      )}
      {step === 'rookie-draft' && data.plan !== null && status !== null && (
        <RookieDraftStep league={league} archive={data.archive} plan={data.plan} teams={data.teams} arrivals={status} nameOf={nameOf} refresh={refresh} />
      )}
      {step === 'progression' && data.plan !== null && status !== null && (
        <ProgressionStep league={league} archive={data.archive} plan={data.plan} teams={data.teams} arrivals={status} nameOf={nameOf} refresh={refresh} />
      )}
      {step === 'approval' && data.plan !== null && <ApprovalStep league={league} plan={data.plan} onApproved={exit} />}
    </WizardShell>
  );
}
