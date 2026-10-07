"use client";

import { useState, useTransition } from "react";
import { saveSavedProfile } from "@/app/profile/actions";
import type { PatientProfile } from "@/lib/types";

const emptyProfile: PatientProfile = {
  age: null, sex: "unknown", primaryDiagnosis: "", stage: null,
  biomarkers: [], priorTreatments: [], location: null,
  hasMetastaticDisease: null, interests: [],
};

export default function ProfileForm({ email, initialName, initialProfile }: { email: string; initialName: string; initialProfile: PatientProfile | null }) {
  const [profile, setProfile] = useState<PatientProfile>(initialProfile ?? emptyProfile);
  const [name, setName] = useState(initialName);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const update = (patch: Partial<PatientProfile>) => setProfile((current) => ({ ...current, ...patch }));
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await saveSavedProfile(profile, name);
      setMessage("error" in result ? result.error ?? "Unable to save profile." : "Profile saved.");
    });
  };

  return (
    <section className="max-w-2xl space-y-8">
      <header>
        <p className="eyebrow">Your profile</p>
        <h1 className="font-display text-3xl font-semibold text-foreground mt-2">Clinical profile</h1>
        <p className="section-hint mt-3">{email}. Save a few details to personalize your account.</p>
      </header>
      <form onSubmit={save} className="space-y-5">
        <label className="block text-sm font-medium text-foreground">Name<input className="field-input mt-1" value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <label className="text-sm font-medium text-foreground">Age<input className="field-input mt-1" type="number" min="0" max="120" value={profile.age ?? ""} onChange={(e) => update({ age: e.target.value ? Number(e.target.value) : null })} required /></label>
          <label className="text-sm font-medium text-foreground">Sex<select className="field-input mt-1" value={profile.sex} onChange={(e) => update({ sex: e.target.value as PatientProfile["sex"] })} required><option value="unknown">Prefer not to say</option><option value="female">Female</option><option value="male">Male</option></select></label>
        </div>
        <label className="block text-sm font-medium text-foreground">Primary diagnosis <span className="font-normal text-faint">(optional)</span><input className="field-input mt-1" value={profile.primaryDiagnosis} onChange={(e) => update({ primaryDiagnosis: e.target.value })} /></label>
        <div className="flex items-center gap-4"><button type="submit" className="btn-primary" disabled={isPending}>{isPending ? "Saving" : "Save profile"}</button>{message && <p className="text-sm text-faint">{message}</p>}</div>
      </form>
    </section>
  );
}