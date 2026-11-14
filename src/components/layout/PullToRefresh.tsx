import React, { useEffect, useRef, useState } from 'react';
import { ArrowDown, Loader2, RefreshCw } from 'lucide-react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  isRefreshing: boolean;
  enabled: boolean;
  children: React.ReactNode;
}

const PULL_THRESHOLD = 68;
const MAX_PULL_DISTANCE = 104;
const EDGE_GUARD_PX = 20;

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

  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const trackingRef = useRef(false);
  const directionLockedRef = useRef<'none' | 'pull' | 'ignore'>('none');
  const pullDistanceRef = useRef(0);
  const isBusyRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    isBusyRef.current = isRefreshing || localRefreshing;
  }, [isRefreshing, localRefreshing]);

  useEffect(() => {
    if (!enabled) {
      trackingRef.current = false;
      directionLockedRef.current = 'none';
      pullDistanceRef.current = 0;
      setPullDistance(0);
      return;
    }

    const getScrollTop = () =>
      Math.max(window.scrollY || 0, document.documentElement?.scrollTop || 0, document.body?.scrollTop || 0);

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
        const damped = Math.min(MAX_PULL_DISTANCE, Math.round(deltaY * 0.45));
        pullDistanceRef.current = damped;
        setPullDistance(damped);
      }
    };

    const finishTouch = () => {
      if (!trackingRef.current) return;
      trackingRef.current = false;
      directionLockedRef.current = 'none';

      const finalPull = pullDistanceRef.current;
      pullDistanceRef.current = 0;
      setPullDistance(0);

      if (finalPull >= PULL_THRESHOLD && !isBusyRef.current) {
        setLocalRefreshing(true);
        Promise.resolve(onRefreshRef.current())
          .catch(() => {})
          .finally(() => {
            setTimeout(() => {
              setLocalRefreshing(false);
            }, 250);
          });
      }
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
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
  const indicatorHeight = activeRefresh ? 48 : pullDistance > 10 ? pullDistance : 0;

  return (
    <>
      <div
        aria-live="polite"
        style={{ height: `${indicatorHeight}px` }}
        className={`w-full overflow-hidden flex items-center justify-center bg-[#F3F4F2] border-b transition-[height,opacity] ${
          indicatorHeight > 0 ? 'border-[#E2E4E0] opacity-100' : 'border-transparent opacity-0 pointer-events-none'
        } ${pullDistance > 0 && !activeRefresh ? 'duration-0' : 'duration-200 ease-out'}`}
      >
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-[#E2E4E0] shadow-xs text-xs font-semibold text-[#30334F]">
          {activeRefresh ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#F28C1B]" />
              <span>Atualizando dados...</span>
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
      </div>
      {children}
    </>
  );
};
