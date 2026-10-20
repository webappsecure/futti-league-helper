import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';
import { dropIndex } from '@/seasons/season-archive';

const ROW_HEIGHT = 52;
const ROW_PITCH = ROW_HEIGHT + Spacing.two;
/** On touch the drag starts after a short hold so the page can still be scrolled. */
const HOLD_MS = 180;

export interface SortableRow {
  id: string;
  label: string;
}

interface DragState {
  from: SharedValue<number>;
  to: SharedValue<number>;
  dy: SharedValue<number>;
}

interface RowProps {
  row: SortableRow;
  index: number;
  count: number;
  disabled: boolean;
  drag: DragState;
  onMove: (from: number, to: number) => void;
  /** Web only: a move made with the arrow keys, so focus can follow the row. */
  onKeyMove: (id: string, from: number, to: number) => void;
  registerNode: (id: string, node: Focusable | null) => void;
}

interface Focusable {
  focus?: () => void;
}

const isWeb = Platform.OS === 'web';

function Row({ row, index, count, disabled, drag, onMove, onKeyMove, registerNode }: RowProps) {
  const { from, to, dy } = drag;
  const [focused, setFocused] = useState(false);
  const reset = () => {
    'worklet';
    from.set(-1);
    to.set(-1);
    dy.set(0);
  };

  let pan = Gesture.Pan()
    .enabled(!disabled)
    .onStart(() => {
      from.set(index);
      to.set(index);
      dy.set(0);
    })
    .onUpdate((e) => {
      dy.set(e.translationY);
      to.set(dropIndex(index, e.translationY, ROW_PITCH, count));
    })
    .onEnd((_e, success) => {
      const target = to.get();
      // A move keeps the drag state until the new order renders, so the rows do not jump back for a frame.
      if (success && target !== index) scheduleOnRN(onMove, index, target);
      else reset();
    })
    .onFinalize((_e, success) => {
      if (!success) reset();
    });
  pan = Platform.OS === 'web' ? pan.minDistance(4) : pan.activateAfterLongPress(HOLD_MS);

  const style = useAnimatedStyle(() => {
    const dragging = from.get() === index;
    let y = index * ROW_PITCH;
    if (dragging) {
      y += dy.get();
    } else if (from.get() >= 0) {
      if (from.get() < index && to.get() >= index) y -= ROW_PITCH;
      else if (from.get() > index && to.get() <= index) y += ROW_PITCH;
    }
    return { transform: [{ translateY: dragging ? y : withTiming(y, { duration: 150 }) }], zIndex: dragging ? 10 : 0 };
  });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        accessible
        accessibilityLabel={`${row.label}, position ${index + 1} of ${count}`}
        accessibilityHint={isWeb ? 'Drag to change the position, or use the up and down arrow keys' : 'Press and hold, then drag to change the position'}
        ref={(node: unknown) => registerNode(row.id, node as Focusable | null)}
        {...(isWeb
          ? {
              tabIndex: disabled ? -1 : 0,
              onFocus: () => setFocused(true),
              onBlur: () => setFocused(false),
              onKeyDown: (e: { key: string; preventDefault: () => void }) => {
                if (disabled) return;
                const target = e.key === 'ArrowUp' ? index - 1 : e.key === 'ArrowDown' ? index + 1 : null;
                if (target === null) return;
                e.preventDefault();
                if (target >= 0 && target < count) onKeyMove(row.id, index, target);
              },
            }
          : null)}
        accessibilityActions={[
          { name: 'moveUp', label: 'Move up' },
          { name: 'moveDown', label: 'Move down' },
        ]}
        onAccessibilityAction={(e) => {
          if (disabled) return;
          if (e.nativeEvent.actionName === 'moveUp') onMove(index, index - 1);
          else if (e.nativeEvent.actionName === 'moveDown') onMove(index, index + 1);
        }}
        style={[styles.slot, style]}>
        <ThemedView type="backgroundSelected" style={[styles.row, disabled && styles.dim, focused && styles.focused]}>
          <ThemedText style={styles.position}>{index + 1}.</ThemedText>
          <ThemedText style={styles.team} numberOfLines={1}>
            {row.label}
          </ThemedText>
          <ThemedText themeColor="textSecondary" accessibilityElementsHidden importantForAccessibility="no">
            ≡
          </ThemedText>
        </ThemedView>
      </Animated.View>
    </GestureDetector>
  );
}

/** Rows that are dragged to reorder; `onMove(from, to)` is called once on release. */
export function SortableList({ rows, disabled, onMove }: { rows: SortableRow[]; disabled: boolean; onMove: (from: number, to: number) => void }) {
  const from = useSharedValue(-1);
  const to = useSharedValue(-1);
  const dy = useSharedValue(0);
  const orderKey = rows.map((r) => r.id).join('|');

  // The new order has rendered (or the list changed underneath the drag): clear the drag state.
  useEffect(() => {
    from.set(-1);
    to.set(-1);
    dy.set(0);
  }, [orderKey, from, to, dy]);

  // After an arrow-key move the rows are re-ordered in the DOM, which can drop focus: put it back on the moved row.
  const nodes = useRef(new Map<string, Focusable>());
  const refocus = useRef<string | null>(null);
  useEffect(() => {
    if (refocus.current !== null) nodes.current.get(refocus.current)?.focus?.();
    refocus.current = null;
  }, [orderKey]);

  const drag: DragState = { from, to, dy };
  return (
    <ThemedView style={{ height: Math.max(0, rows.length * ROW_PITCH - Spacing.two) }}>
      {rows.map((row, i) => (
        <Row
          key={row.id}
          row={row}
          index={i}
          count={rows.length}
          disabled={disabled}
          drag={drag}
          onMove={onMove}
          onKeyMove={(id, a, b) => {
            refocus.current = id;
            onMove(a, b);
          }}
          registerNode={(id, node) => {
            if (node === null) nodes.current.delete(id);
            else nodes.current.set(id, node);
          }}
        />
      ))}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  slot: { position: 'absolute', left: 0, right: 0, top: 0, height: ROW_HEIGHT, ...(Platform.OS === 'web' ? ({ cursor: 'grab', userSelect: 'none' } as object) : null) },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, borderRadius: Spacing.two },
  dim: { opacity: 0.6 },
  focused: { borderWidth: 2, borderColor: Accent.primary },
  position: { width: 28 },
  team: { flex: 1 },
});
