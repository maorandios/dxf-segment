export { AuthScreen } from "./AuthScreen";
export { AuthLegalModal } from "./AuthLegalModal";
export type { AuthLegalDoc } from "./AuthLegalModal";
export {
  applyCreditsBalance,
  clearAuthSession,
  completeMagicLinkStub,
  ensureAuthBootstrap,
  getAuthSession,
  getCurrentOmegaUser,
  isAuthBootstrapped,
  isSignedIn,
  refreshAuthSession,
  setCurrentOmegaUser,
  signOut,
  subscribeAuthSession,
} from "./authSession";
export type { AuthSession } from "./authSession";
export {
  useAuthBootstrapped,
  useAuthSession,
  useIsSignedIn,
  useOmegaCurrentUser,
} from "./useAuthSession";
