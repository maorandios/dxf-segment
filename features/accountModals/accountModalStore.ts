/**
 * Shared account-modal open state — one modal at a time, no route change.
 */

import { useSyncExternalStore } from "react";
import type { AccountModalType } from "./types";

type Listener = () => void;

let activeModal: AccountModalType = null;
let focusReturnEl: HTMLElement | null = null;
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function getAccountModal(): AccountModalType {
  return activeModal;
}

export function getAccountModalFocusReturn(): HTMLElement | null {
  return focusReturnEl;
}

export function openAccountModal(
  type: Exclude<AccountModalType, null>,
  focusReturn?: HTMLElement | null
): void {
  focusReturnEl = focusReturn ?? null;
  if (activeModal === type) {
    emit();
    return;
  }
  activeModal = type;
  emit();
}

export function closeAccountModal(): void {
  if (activeModal == null) return;
  activeModal = null;
  emit();
  const el = focusReturnEl;
  focusReturnEl = null;
  if (el && typeof el.focus === "function") {
    window.setTimeout(() => {
      try {
        el.focus();
      } catch {
        /* ignore */
      }
    }, 0);
  }
}

export function subscribeAccountModal(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAccountModal(): AccountModalType {
  return useSyncExternalStore(
    subscribeAccountModal,
    getAccountModal,
    () => null
  );
}
