"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { PatientProfile } from "@/lib/types";
import { boundedText, validatePatientProfile } from "@/lib/security";

export async function getSavedProfile(): Promise<PatientProfile | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const record = await prisma.userProfile.findUnique({ where: { userId: session.user.id } });
  return validatePatientProfile(record?.data, { requireDiagnosis: false }) ?? null;
}

export async function saveSavedProfile(profile: PatientProfile, nameInput: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Please sign in first." };
  const name = boundedText(nameInput, 120);
  const safeProfile = validatePatientProfile(profile, { requireDiagnosis: false });
  if (!name || !safeProfile) return { error: "Please provide your name and valid profile details." };
  const data = safeProfile as unknown as Prisma.InputJsonValue;
  await prisma.$transaction([
    prisma.user.update({
      where: { id: session.user.id },
      data: { name },
    }),
    prisma.userProfile.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id, data },
      update: { data },
    }),
  ]);
  return { success: true };
}