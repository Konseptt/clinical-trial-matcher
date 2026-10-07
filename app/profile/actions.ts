"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { PatientProfile } from "@/lib/types";
import { validatePatientProfile } from "@/lib/security";

export async function getSavedProfile(): Promise<PatientProfile | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const record = await prisma.userProfile.findUnique({ where: { userId: session.user.id } });
  return validatePatientProfile(record?.data) ?? null;
}

export async function saveSavedProfile(profile: PatientProfile) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Please sign in first." };
  const safeProfile = validatePatientProfile(profile);
  if (!safeProfile) return { error: "The clinical profile is invalid or too large." };
  const data = safeProfile as unknown as Prisma.InputJsonValue;
  await prisma.userProfile.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, data },
    update: { data },
  });
  return { success: true };
}