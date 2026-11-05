import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import ProfileForm from "@/components/ProfileForm";
import { getSavedProfile } from "./actions";

export const metadata: Metadata = { title: "Profile", robots: { index: false, follow: false } };

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");
  const profile = await getSavedProfile();
  return (
    <ProfileForm
      email={session.user.email ?? ""}
      initialName={session.user.name ?? ""}
      initialProfile={profile}
    />
  );
}