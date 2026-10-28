"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

// Browsers throttle timers and network scheduling hard in backgrounded
// tabs — enough to turn a multi-hour "ingest all" into a multi-day one
// without any error ever being thrown. Warns once per run, the first time
// the tab goes to the background while `active` is true.
export function useBackgroundTabWarning(active: boolean): void {
  const warnedRef = useRef(false);

  useEffect(() => {
    if (!active) {
      warnedRef.current = false;
      return;
    }
    function handleVisibilityChange() {
      if (document.hidden && !warnedRef.current) {
        warnedRef.current = true;
        toast(
          "This tab is in the background — browsers slow background tabs down a lot. Keep it focused to avoid a much longer run.",
          { icon: "⚠️", duration: 8000 },
        );
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [active]);
}
