import { FirebaseAuthProvider } from "@/lib/firebase/auth-provider";
import { RealAuthGate } from "@/components/real/RealAuthGate";
import { RealFrame } from "@/components/real/RealFrame";

export const dynamic = "force-dynamic";

export default function RealAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <FirebaseAuthProvider>
      <RealFrame>
        <RealAuthGate>{children}</RealAuthGate>
      </RealFrame>
    </FirebaseAuthProvider>
  );
}
