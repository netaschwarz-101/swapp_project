"use client";

import { Suspense, useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { login, type AuthActionState } from "@/actions/auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/submit-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const initialState: AuthActionState = {};

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [state, formAction] = useActionState(login, initialState);
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const confirmError = searchParams.get("error") === "confirmation_failed";

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm items-center">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Log in</CardTitle>
          <CardDescription>
            Welcome back to Swapp.{" "}
            <Link href="/signup" className="underline underline-offset-4">
              Sign up
            </Link>{" "}
            if you&rsquo;re new.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {confirmError && (
            <p
              className="text-destructive mb-4 text-sm"
              role="alert"
            >
              That confirmation link is invalid or expired. Try logging in,
              or sign up again to get a new one.
            </p>
          )}
          <form action={formAction} className="flex flex-col gap-4">
            <input type="hidden" name="next" value={next} />
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
              />
            </div>
            {state.error && (
              <p className="text-destructive text-sm" role="alert">
                {state.error}
              </p>
            )}
            <SubmitButton className="w-full" pendingText="Logging in…">
              Log in
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
