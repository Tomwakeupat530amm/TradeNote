"use client";

import { useSyncExternalStore } from "react";
import { isGuestMode } from "./guestMode";

// The Guest flag only changes through a full reload/navigation, so nothing to subscribe to.
function noopSubscribe(): () => void {
  return () => {};
}

function serverSnapshot(): boolean {
  return false;
}

/** True when the app runs in Guest demo mode. Server snapshot is always false (no hydration warning). */
export function useGuestMode(): boolean {
  return useSyncExternalStore(noopSubscribe, isGuestMode, serverSnapshot);
}
