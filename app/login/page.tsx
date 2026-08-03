import type { Metadata } from "next";
import { AuthScreen } from "@/features/auth";

export const metadata: Metadata = {
  title: "התחברות למערכת",
};

export default function LoginPage() {
  return <AuthScreen />;
}
