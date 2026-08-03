export { AuthScreen } from "./AuthScreen";
export { AuthLegalModal } from "./AuthLegalModal";
export type { AuthLegalDoc } from "./AuthLegalModal";
export {
  completeMagicLinkStub,
  getAuthSession,
  isSignedIn,
  signOut,
  subscribeAuthSession,
} from "./authSession";
export type { AuthSession } from "./authSession";
export { useAuthSession, useIsSignedIn } from "./useAuthSession";
