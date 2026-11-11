export type FirebasePublicConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  messagingSenderId: string;
};

export type VerifiedFirebaseIdentity = {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  token: string;
  claims: Record<string, unknown>;
};

export type ProvisionClaimResult = {
  ok: boolean;
  role: "authenticated";
  uid: string;
  preservedClaims: string[];
};

export class AuthenticationError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "AuthenticationError";
    this.status = status;
    this.code = code;
  }
}
