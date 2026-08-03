import type { Metadata } from "next";
import { AuthScreen } from "@/features/auth";

export const metadata: Metadata = {
  title: "כניסה ל-OMEGA",
};

export default function LoginPage() {
  return <AuthScreen />;
}
