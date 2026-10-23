import { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';
import { createLatestOnly } from '@/leagues/latest-only';
import type { League } from '@/leagues/league';
import { approvalFailureText, approveOffseason, prepareApproval, type ApprovalFailure, type PreparedApproval } from '@/offseason/approval-repository';
import type { OffseasonPlan } from '@/offseason/offseason-plan';
import { useDatabase } from '@/storage/storage-provider';

interface ApprovalStepProps {
  league: League;
  /** Changes whenever the plan does, so the summary is read again. */
  plan: OffseasonPlan;
  onApproved: () => void;
}

type Check = { status: 'loading' } | { status: 'blocked'; failure: ApprovalFailure } | { status: 'ready'; prepared: PreparedApproval };

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Summarises what approving will do for the league and the leagues linked to it, then approves after a second tap. */
export function ApprovalStep({ league, plan, onApproved }: ApprovalStepProps) {
  const db = useDatabase();
  const [check, setCheck] = useState<Check>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [latest] = useState(createLatestOnly);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const isLatest = latest.begin();
    prepareApproval(db, league).then(
      (result) => {
        if (isLatest()) setCheck(result.ok ? { status: 'ready', prepared: result.value } : { status: 'blocked', failure: result.error });
      },
      (e) => {
        if (isLatest()) setCheck({ status: 'blocked', failure: { kind: 'storage', error: e instanceof Error ? e : new Error(String(e)) } });
      },
    );
    return () => latest.cancel();
  }, [db, league, plan, attempt, latest]);

  const approve = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await approveOffseason(db, league);
      if (result.ok) onApproved();
      else {
        setConfirming(false);
        setError(approvalFailureText(result.error));
        setAttempt((n) => n + 1);
      }
    } catch (e) {
      setConfirming(false);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [busy, db, league, onApproved]);

  if (check.status === 'loading') return <ThemedText>Checking the offseason...</ThemedText>;
  if (check.status === 'blocked') {
    return (
      <ThemedView style={styles.body}>
        <ThemedText type="small" accessibilityRole="alert" style={styles.error}>
          {check.failure.kind === 'storage' ? 'Could not check the offseason. ' : 'Not ready to approve. '}
          {approvalFailureText(check.failure)}
        </ThemedText>
        <ThemedView style={styles.actions}>
          <Button label="Check again" onPress={() => setAttempt((n) => n + 1)} />
        </ThemedView>
      </ThemedView>
    );
  }

  const { leagues, approval } = check.prepared;
  const unassigned = approval.franchises.filter((f) => f.leagueId === undefined).length;
  return (
    <ThemedView style={styles.body}>
      {leagues.length > 1 && (
        <ThemedText type="small">Approving applies the offseason for every linked league together: {leagues.map((l) => l.name).join(', ')}.</ThemedText>
      )}
      {approval.summaries.map((s) => (
        <ThemedView key={s.leagueId} style={styles.league}>
          <ThemedText type="smallBold">{leagues.find((l) => l.id === s.leagueId)?.name ?? 'League'}</ThemedText>
          <ThemedText type="small">
            {count(s.teams, 'team', 'teams')} in the next season, {count(s.retired, 'player retires', 'players retire')}, {count(s.rookies, 'rookie joins', 'rookies join')}, {count(s.newTeams, 'new team', 'new teams')}, {count(s.formerTeams, 'former team returns', 'former teams return')}.
          </ThemedText>
        </ThemedView>
      ))}
      {unassigned > 0 && (
        <ThemedText type="small">{count(unassigned, 'team leaves', 'teams leave')} with no league to join and stays unassigned.</ThemedText>
      )}
      {error !== null && (
        <ThemedText type="small" accessibilityRole="alert" style={styles.error}>
          Could not approve. {error}
        </ThemedText>
      )}
      {confirming ? (
        <>
          <ThemedText type="small" accessibilityRole="alert">
            This applies every change and starts the next season. It cannot be undone.
          </ThemedText>
          <ThemedView style={styles.actions}>
            <Button label={busy ? 'Approving...' : 'Confirm approval'} variant="primary" disabled={busy} onPress={approve} />
            <Button label="Cancel" disabled={busy} onPress={() => setConfirming(false)} />
          </ThemedView>
        </>
      ) : (
        <ThemedView style={styles.actions}>
          <Button label="Approve offseason" variant="primary" onPress={() => setConfirming(true)} />
        </ThemedView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.two },
  league: { gap: Spacing.one },
  actions: { flexDirection: 'row', gap: Spacing.two },
  error: { color: Accent.danger },
});
