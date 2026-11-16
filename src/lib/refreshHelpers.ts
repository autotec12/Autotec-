import type { RefreshDataResult } from '../context/DataContext';

export const PULL_THRESHOLD = 68;
export const MAX_PULL_DISTANCE = 104;
export const EDGE_GUARD_PX = 20;

export type PullFeedbackState =
  | { kind: 'idle' }
  | { kind: 'pulling'; distance: number; readyToRelease: boolean }
  | { kind: 'refreshing' }
  | { kind: 'success'; message: string; refreshedAt?: string }
  | { kind: 'error'; message: string };

export function calculateDampedPull(deltaY: number): number {
  if (!Number.isFinite(deltaY) || deltaY <= 0) return 0;
  return Math.min(MAX_PULL_DISTANCE, Math.round(deltaY * 0.45));
}

export function shouldTriggerPullRefresh(params: {
  pullDistance: number;
  isBusy: boolean;
  enabled: boolean;
}): boolean {
  if (!params.enabled || params.isBusy) return false;
  return params.pullDistance >= PULL_THRESHOLD;
}

export function resolvePullOutcome(
  result: RefreshDataResult | void | null | undefined
): { ok: boolean; state: PullFeedbackState } {
  if (!result || result.ok === true) {
    return {
      ok: true,
      state: {
        kind: 'success',
        message: 'Dados atualizados com sucesso!',
        refreshedAt: result && 'refreshedAt' in result ? result.refreshedAt : undefined,
      },
    };
  }

  return {
    ok: false,
    state: {
      kind: 'error',
      message:
        result.error ||
        'Não foi possível atualizar os dados agora. Os últimos dados válidos foram mantidos.',
    },
  };
}
