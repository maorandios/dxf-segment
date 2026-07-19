"use client";

import { useSyncExternalStore } from "react";
import {
  getSimpleIntakeSession,
  subscribeSimpleIntake,
} from "./sessionStore";
import type { SimpleIntakeSession } from "./types";

export function useSimpleIntakeSession(): SimpleIntakeSession {
  return useSyncExternalStore(
    subscribeSimpleIntake,
    getSimpleIntakeSession,
    getSimpleIntakeSession
  );
}
