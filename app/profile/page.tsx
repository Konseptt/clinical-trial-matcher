import { redirect } from "next/navigation";
import { auth } from "@/auth";
import ProfileForm from "@/components/ProfileForm";
import { getSavedProfile } from "./actions";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");
  const profile = await getSavedProfile();
  return <ProfileForm email={session.user.email ?? ""} initialProfile={profile} />;
}