import { FirebaseAuthProvider } from "@/lib/firebase/auth-provider";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <FirebaseAuthProvider>{children}</FirebaseAuthProvider>;
}
