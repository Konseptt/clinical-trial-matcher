import { signIn } from "@/auth";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const params = await searchParams;
  const callbackUrl = params.callbackUrl?.startsWith("/") && !params.callbackUrl.startsWith("//")
    ? params.callbackUrl
    : "/profile";

  return (
    <section className="max-w-md space-y-6">
      <div>
        <p className="eyebrow">Account access</p>
        <h1 className="font-display text-3xl font-semibold text-foreground mt-2">Sign in to use AI review</h1>
        <p className="section-hint mt-3">Google sign-in unlocks patient summaries and the eligibility review panel after your trial search.</p>
      </div>
      <form action={async () => { "use server"; await signIn("google", { redirectTo: callbackUrl }); }}>
        <button type="submit" className="btn-primary">Continue with Google</button>
      </form>
    </section>
  );
}