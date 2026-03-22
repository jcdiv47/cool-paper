"use client";

import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { useMutation } from "convex/react";
import { SignInButton } from "@clerk/nextjs";
import { api } from "../../convex/_generated/api";
import { type ReactNode, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";

/**
 * Calls storeUser once after authentication to upsert the user record.
 */
function StoreUserOnMount({ children }: { children: ReactNode }) {
  const storeUser = useMutation(api.users.storeUser);
  const storedRef = useRef(false);

  useEffect(() => {
    if (!storedRef.current) {
      storedRef.current = true;
      storeUser().catch(() => {
        storedRef.current = false;
      });
    }
  }, [storeUser]);

  return <>{children}</>;
}

/**
 * Gates the entire app behind authentication.
 * - Loading → spinner
 * - Unauthenticated → branded login screen with Clerk SignInButton
 * - Authenticated → renders children + upserts user record
 */
export function AuthGate({ children }: { children: ReactNode }) {
  return (
    <>
      <AuthLoading>
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AuthLoading>

      <Unauthenticated>
        <div className="flex min-h-screen items-center justify-center bg-background px-4">
          <div className="w-full max-w-sm space-y-8 text-center">
            <div className="space-y-3">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15">
                <span className="text-2xl font-bold text-primary">C</span>
              </div>
              <h1 className="font-serif text-2xl font-semibold tracking-tight">
                Cool Paper
              </h1>
              <p className="text-sm text-muted-foreground">
                Sign in to access your research papers
              </p>
            </div>
            <SignInButton mode="modal">
              <button className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
                Sign in
              </button>
            </SignInButton>
          </div>
        </div>
      </Unauthenticated>

      <Authenticated>
        <StoreUserOnMount>{children}</StoreUserOnMount>
      </Authenticated>
    </>
  );
}
