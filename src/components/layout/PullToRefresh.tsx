import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowDown, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import type { RefreshDataResult } from '../../context/DataContext';
import {
  EDGE_GUARD_PX,
  PULL_THRESHOLD,
  calculateDampedPull,
  resolvePullOutcome,
  shouldTriggerPullRefresh,
  type PullFeedbackState,
} from '../../lib/refreshHelpers';

interface PullToRefreshProps {
  onRefresh: () => Promise<RefreshDataResult | void>;
  isRefreshing: boolean;
  enabled: boolean;
  children: React.ReactNode;
}

function canStartPullFromTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return true;

  let el: HTMLElement | null = target;
  while (el && el !== document.body && el !== document.documentElement) {
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'OPTION') {
      return false;
    }

    if (el.getAttribute('role') === 'dialog' || el.getAttribute('aria-modal') === 'true') {
      return false;
    }

    const style = window.getComputedStyle(el);
    if (style.position === 'fixed') {
      return false;
    }

    const isVerticallyScrollable =
      (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
      el.scrollHeight > el.clientHeight + 2;

    if (isVerticallyScrollable && el.scrollTop > 1) {
      return false;
    }

    el = el.parentElement;
  }

  return true;
}

export const PullToRefresh: React.FC<PullToRefreshProps> = ({
  onRefresh,
  isRefreshing,
  enabled,
  children,
}) => {
  const [pullDistance, setPullDistance] = useState(0);
  const [localRefreshing, setLocalRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<PullFeedbackState>({ kind: 'idle' });

  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const trackingRef = useRef(false);
  const directionLockedRef = useRef<'none' | 'pull' | 'ignore'>('none');
  const pullDistanceRef = useRef(0);
  const isBusyRef = useRef(false);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onRefreshRef = useRef(onRefresh);
  const enabledRef = useRef(enabled);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    isBusyRef.current = isRefreshing || localRefreshing;
  }, [isRefreshing, localRefreshing]);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      trackingRef.current = false;
      directionLockedRef.current = 'none';
      pullDistanceRef.current = 0;
      setPullDistance(0);
      return;
    }

    const getScrollTop = () =>
      Math.max(
        window.scrollY || 0,
        document.documentElement?.scrollTop || 0,
        document.body?.scrollTop || 0
      );

    const clearFeedbackTimer = () => {
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current);
        feedbackTimerRef.current = null;
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (isBusyRef.current || e.touches.length !== 1) {
        trackingRef.current = false;
        return;
      }

      if (getScrollTop() > 1) {
        trackingRef.current = false;
        return;
      }

      const touch = e.touches[0];
      // Avoid interfering with Android edge back-swipe gestures
      if (touch.clientX < EDGE_GUARD_PX || touch.clientX > window.innerWidth - EDGE_GUARD_PX) {
        trackingRef.current = false;
        return;
      }

      if (!canStartPullFromTarget(e.target)) {
        trackingRef.current = false;
        return;
      }

      startXRef.current = touch.clientX;
      startYRef.current = touch.clientY;
      trackingRef.current = true;
      directionLockedRef.current = 'none';
      pullDistanceRef.current = 0;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!trackingRef.current || isBusyRef.current || e.touches.length !== 1) {
        return;
      }

      const touch = e.touches[0];
      const deltaY = touch.clientY - startYRef.current;
      const deltaX = Math.abs(touch.clientX - startXRef.current);

      if (directionLockedRef.current === 'none') {
        if (Math.abs(deltaY) < 8 && deltaX < 8) {
          return;
        }
        // If user scrolls down the page or swipes horizontally, immediately disengage pull tracking
        if (deltaY <= 0 || deltaX > deltaY || getScrollTop() > 1) {
          directionLockedRef.current = 'ignore';
          trackingRef.current = false;
          if (pullDistanceRef.current !== 0) {
            pullDistanceRef.current = 0;
            setPullDistance(0);
          }
          return;
        }
        directionLockedRef.current = 'pull';
      }

      if (directionLockedRef.current === 'pull') {
        if (getScrollTop() > 1 || deltaY <= 0) {
          pullDistanceRef.current = 0;
          setPullDistance(0);
          return;
        }

        // Prevent native browser/PWA overscroll bounce from intercepting while user is actively pulling
        if (e.cancelable) {
          e.preventDefault();
        }

        clearFeedbackTimer();
        const damped = calculateDampedPull(deltaY);
        pullDistanceRef.current = damped;
        setPullDistance(damped);
        setFeedback({
          kind: 'pulling',
          distance: damped,
          readyToRelease: damped >= PULL_THRESHOLD,
        });
      }
    };

    const finishTouch = () => {
      if (!trackingRef.current) return;
      trackingRef.current = false;
      directionLockedRef.current = 'none';

      const finalPull = pullDistanceRef.current;
      pullDistanceRef.current = 0;
      setPullDistance(0);

      if (
        !shouldTriggerPullRefresh({
          pullDistance: finalPull,
          isBusy: isBusyRef.current,
          enabled: enabledRef.current,
        })
      ) {
        setFeedback((prev) => (prev.kind === 'pulling' ? { kind: 'idle' } : prev));
        return;
      }

      clearFeedbackTimer();
      isBusyRef.current = true;
      setLocalRefreshing(true);
      setFeedback({ kind: 'refreshing' });

      Promise.resolve(onRefreshRef.current())
        .then((res) => {
          const outcome = resolvePullOutcome(res);
          setLocalRefreshing(false);
          isBusyRef.current = false;
          setFeedback(outcome.state);
          feedbackTimerRef.current = setTimeout(
            () => {
              setFeedback({ kind: 'idle' });
            },
            outcome.ok ? 1700 : 3200
          );
        })
        .catch((err) => {
          const outcome = resolvePullOutcome({
            ok: false,
            error:
              err instanceof Error && err.message
                ? err.message
                : 'Não foi possível atualizar os dados. Mantendo os últimos dados válidos.',
          });
          setLocalRefreshing(false);
          isBusyRef.current = false;
          setFeedback(outcome.state);
          feedbackTimerRef.current = setTimeout(() => {
            setFeedback({ kind: 'idle' });
          }, 3200);
        });
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', finishTouch, { passive: true });
    window.addEventListener('touchcancel', finishTouch, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', finishTouch);
      window.removeEventListener('touchcancel', finishTouch);
    };
  }, [enabled]);

  const activeRefresh = isRefreshing || localRefreshing;
  const isReadyToRelease = pullDistance >= PULL_THRESHOLD;
  const isShowingResult = feedback.kind === 'success' || feedback.kind === 'error';
  const indicatorHeight = activeRefresh
    ? 50
    : isShowingResult
      ? 48
      : pullDistance > 10
        ? pullDistance
        : 0;

  return (
    <>
      <div
        aria-live="polite"
        style={{ height: `${indicatorHeight}px` }}
        className={`w-full overflow-hidden flex items-center justify-center bg-[#F3F4F2] border-b transition-[height,opacity] ${
          indicatorHeight > 0
            ? 'border-[#E2E4E0] opacity-100'
            : 'border-transparent opacity-0 pointer-events-none'
        } ${pullDistance > 0 && !activeRefresh ? 'duration-0' : 'duration-200 ease-out'}`}
      >
        {feedback.kind === 'success' && !activeRefresh ? (
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 shadow-xs text-xs font-semibold text-emerald-800">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>{feedback.message}</span>
          </div>
        ) : feedback.kind === 'error' && !activeRefresh ? (
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-50 border border-amber-300 shadow-xs text-xs font-semibold text-amber-900 max-w-[92vw]">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="truncate">{feedback.message}</span>
          </div>
        ) : (
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-[#E2E4E0] shadow-xs text-xs font-semibold text-[#30334F]">
            {activeRefresh ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#F28C1B]" />
                <span>Atualizando dados do Firestore...</span>
              </>
            ) : isReadyToRelease ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 text-[#F28C1B]" />
                <span className="text-[#C86905]">Solte para atualizar</span>
              </>
            ) : (
              <>
                <ArrowDown className="w-3.5 h-3.5 text-[#5F647E]" />
                <span className="text-[#5F647E]">Puxe para atualizar</span>
              </>
            )}
          </div>
        )}
      </div>
      {children}
    </>
  );
};
