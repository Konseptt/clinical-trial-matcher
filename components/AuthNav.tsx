"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSession, signOut } from "next-auth/react";

// Client-side so the root layout stays static: a server `auth()` call there
// made every route dynamic and put a DB session lookup before first byte.
export default function AuthNav() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    getSession().then((s) => setSignedIn(Boolean(s?.user))).catch(() => setSignedIn(false));
  }, []);

  if (signedIn === null) return <span className="w-14" aria-hidden />;

  return signedIn ? (
    <>
      <Link href="/profile" className="font-body text-sm text-primary hover:text-foreground">
        Profile
      </Link>
      <button
        type="button"
        onClick={() => signOut({ redirectTo: "/" })}
        className="font-body text-sm text-primary underline underline-offset-2 hover:text-foreground"
      >
        Log out
      </button>
    </>
  ) : (
    <Link href="/sign-in" className="font-body text-sm text-primary hover:text-foreground">
      Sign in
    </Link>
  );
}
