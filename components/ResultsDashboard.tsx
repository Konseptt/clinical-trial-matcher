import Link from "next/link";
import { useState, useEffect } from "react";
import { formatTrialStatus } from "@/lib/format";
import { formatLocationDisplay } from "@/lib/location";
import type {
  MatchResponse,
  PatientProfile,
  PatientLocation,
  MatchedTrial,
  TreatmentHistory,
  BiomarkerGate,
  WashoutCheckResult
} from "@/lib/types";
import { getSimplifiedSummaryAction } from "@/app/actions/match";

interface ResultsDashboardProps {
  data: MatchResponse;
  onProfileUpdate: (updatedProfile: PatientProfile) => void;
  isUpdating: boolean;
}

function safeUrl(url: string): string {
  if (!url) return "#";
  const normalized = url.trim().toLowerCase();
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    return url;
  }
  return "#";
}

function matchBadgeClass(score: number): string {
  if (score >= 80) return "match-badge-high match-score-high";
  if (score >= 55) return "match-badge-mid match-score-mid";
  return "match-badge-low match-score-low";
}

function matchLabel(score: number): string {
  if (score >= 80) return "Strong fit";
  if (score >= 55) return "Possible fit";
  return "Worth reviewing";
}

function formatSex(sex: PatientProfile["sex"]): string | null {
  if (sex === "unknown") return null;
  return sex.charAt(0).toUpperCase() + sex.slice(1);
}

interface TagEditorProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}

function TagEditor({ tags, onChange, placeholder }: TagEditorProps) {
  const [input, setInput] = useState("");

  const handleAdd = () => {
    const trimmed = input.trim();
    if (trimmed && !tags.some(t => t.toLowerCase() === trimmed.toLowerCase())) {
      onChange([...tags, trimmed]);
      setInput("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  };

  const handleRemove = (indexToRemove: number) => {
    onChange(tags.filter((_, i) => i !== indexToRemove));
  };

  return (
    <div className="mt-1">
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.map((tag, idx) => (
          <span
            key={idx}
            className="inline-flex items-center gap-1 bg-muted px-2 py-0.5 rounded text-xs text-foreground font-medium border border-border-subtle"
          >
            {tag}
            <button
              type="button"
              onClick={() => handleRemove(idx)}
              className="text-faint hover:text-destructive focus:outline-none font-bold text-sm leading-none pl-1"
              aria-label={`Remove ${tag}`}
            >
              &times;
            </button>
          </span>
        ))}
        {tags.length === 0 && (
          <span className="text-xs text-faint italic py-0.5">None added yet</span>
        )}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || "Add item..."}
          className="w-full bg-background border border-border rounded-md px-2.5 py-1 text-xs text-foreground focus:ring-1 focus:ring-primary focus:outline-none"
        />
        <button
          type="button"
          onClick={handleAdd}
          className="bg-primary hover:bg-secondary text-on-primary text-xs font-semibold px-3 py-1 rounded-md transition-colors"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function ProfileSummary({
  profile,
  onUpdate,
}: {
  profile: PatientProfile;
  onUpdate: (updatedProfile: PatientProfile) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedAge, setEditedAge] = useState<number | "">(profile.age ?? "");
  const [editedSex, setEditedSex] = useState<PatientProfile["sex"]>(profile.sex);
  const [editedDiagnosis, setEditedDiagnosis] = useState(profile.primaryDiagnosis);
  const [editedStage, setEditedStage] = useState(profile.stage ?? "");
  const [editedCity, setEditedCity] = useState(profile.location?.city ?? "");
  const [editedState, setEditedState] = useState(profile.location?.state ?? "");
  const [editedCountry, setEditedCountry] = useState(profile.location?.country ?? "");
  const [editedMetastasis, setEditedMetastasis] = useState<string>(
    profile.hasMetastaticDisease === true
      ? "yes"
      : profile.hasMetastaticDisease === false
      ? "no"
      : "unknown"
  );
  const [editedBiomarkers, setEditedBiomarkers] = useState<string[]>(profile.biomarkers);
  const [editedPriorTreatments, setEditedPriorTreatments] = useState<string[]>(profile.priorTreatments);
  const [editedTimeline, setEditedTimeline] = useState<TreatmentHistory[]>(profile.priorTreatmentsTimeline || []);
  const [editedInterests, setEditedInterests] = useState<string[]>(profile.interests);

  useEffect(() => {
    setEditedAge(profile.age ?? "");
    setEditedSex(profile.sex);
    setEditedDiagnosis(profile.primaryDiagnosis);
    setEditedStage(profile.stage ?? "");
    setEditedCity(profile.location?.city ?? "");
    setEditedState(profile.location?.state ?? "");
    setEditedCountry(profile.location?.country ?? "");
    setEditedMetastasis(
      profile.hasMetastaticDisease === true
        ? "yes"
        : profile.hasMetastaticDisease === false
        ? "no"
        : "unknown"
    );
    setEditedBiomarkers(profile.biomarkers);
    setEditedPriorTreatments(profile.priorTreatments);
    setEditedTimeline(profile.priorTreatmentsTimeline || []);
    setEditedInterests(profile.interests);
  }, [profile]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const updatedLocation: PatientLocation | null =
      editedCity || editedState || editedCountry
        ? {
            city: editedCity.trim() || null,
            state: editedState.trim() || null,
            country: editedCountry.trim() || null,
          }
        : null;

    const updatedProfile: PatientProfile = {
      age: editedAge === "" ? null : Number(editedAge),
      sex: editedSex,
      primaryDiagnosis: editedDiagnosis.trim(),
      stage: editedStage.trim() || null,
      location: updatedLocation,
      hasMetastaticDisease:
        editedMetastasis === "yes"
          ? true
          : editedMetastasis === "no"
          ? false
          : null,
      biomarkers: editedBiomarkers,
      priorTreatments: editedPriorTreatments,
      priorTreatmentsTimeline: editedTimeline,
      interests: editedInterests,
    };

    onUpdate(updatedProfile);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <form onSubmit={handleSave} className="space-y-4 text-left">
        <div className="flex items-center justify-between border-b border-border-subtle pb-3 mb-2">
          <h2 className="font-display text-lg font-semibold text-foreground">
            Edit Details
          </h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-2.5 py-1.5 border border-border text-xs rounded-md hover:bg-muted font-medium text-faint transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-2.5 py-1.5 bg-accent hover:bg-accent-dark text-on-primary text-xs rounded-md font-semibold transition-colors"
            >
              Save
            </button>
          </div>
        </div>

        <div className="space-y-3.5 max-h-[70vh] overflow-y-auto pr-1">
          <div>
            <label className="block text-xs font-semibold text-faint mb-1">Age</label>
            <input
              type="number"
              min="0"
              max="120"
              value={editedAge}
              onChange={(e) =>
                setEditedAge(e.target.value === "" ? "" : Number(e.target.value))
              }
              className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-xs text-foreground focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-faint mb-1">Sex</label>
            <select
              value={editedSex}
              onChange={(e) => setEditedSex(e.target.value as PatientProfile["sex"])}
              className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-xs text-foreground focus:ring-1 focus:ring-primary focus:outline-none"
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="unknown">Unknown</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-faint mb-1">Diagnosis</label>
            <input
              type="text"
              value={editedDiagnosis}
              onChange={(e) => setEditedDiagnosis(e.target.value)}
              className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-xs text-foreground focus:ring-1 focus:ring-primary focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-faint mb-1">Stage</label>
            <input
              type="text"
              value={editedStage}
              onChange={(e) => setEditedStage(e.target.value)}
              placeholder="e.g. Stage III, Stage IV"
              className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-xs text-foreground focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </div>

          <div className="border border-border-subtle rounded-md p-2.5 space-y-2.5 bg-muted/20">
            <span className="block text-xs font-semibold text-faint border-b border-border-subtle pb-1">
              Location
            </span>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] font-semibold text-faint mb-0.5">City</label>
                <input
                  type="text"
                  value={editedCity}
                  onChange={(e) => setEditedCity(e.target.value)}
                  className="w-full bg-background border border-border rounded-md px-2 py-1 text-[11px] text-foreground focus:ring-1 focus:ring-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-faint mb-0.5">State/Prov</label>
                <input
                  type="text"
                  value={editedState}
                  onChange={(e) => setEditedState(e.target.value)}
                  placeholder="MA"
                  className="w-full bg-background border border-border rounded-md px-2 py-1 text-[11px] text-foreground focus:ring-1 focus:ring-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-faint mb-0.5">Country</label>
                <input
                  type="text"
                  value={editedCountry}
                  onChange={(e) => setEditedCountry(e.target.value)}
                  className="w-full bg-background border border-border rounded-md px-2 py-1 text-[11px] text-foreground focus:ring-1 focus:ring-primary focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-faint mb-1">Metastasis</label>
            <select
              value={editedMetastasis}
              onChange={(e) => setEditedMetastasis(e.target.value)}
              className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-xs text-foreground focus:ring-1 focus:ring-primary focus:outline-none"
            >
              <option value="unknown">Unknown</option>
              <option value="yes">Present</option>
              <option value="no">None noted</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-faint">Biomarkers</label>
            <TagEditor
              tags={editedBiomarkers}
              onChange={setEditedBiomarkers}
              placeholder="e.g. HER2 positive"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-faint">Past Treatments</label>
            <TagEditor
              tags={editedPriorTreatments}
              onChange={(newTags) => {
                setEditedPriorTreatments(newTags);
                setEditedTimeline(prev => {
                  return newTags.map(tag => {
                    const existing = prev.find(t => t.name.toLowerCase() === tag.toLowerCase());
                    return existing || { name: tag, ongoing: false };
                  });
                });
              }}
              placeholder="e.g. Chemotherapy"
            />
            {editedTimeline.length > 0 && (
              <div className="mt-3.5 space-y-2.5 border border-border-subtle p-3 rounded-lg bg-muted/20">
                <span className="block text-[10px] font-bold text-faint border-b border-border-subtle pb-1 font-body">
                  Configure Treatment Timing
                </span>
                {editedTimeline.map((item, idx) => (
                  <div key={idx} className="space-y-1.5 p-2 bg-surface rounded-md border border-border-subtle text-xs">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-foreground font-body">{item.name}</span>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={item.ongoing}
                          onChange={(e) => {
                            const val = e.target.checked;
                            setEditedTimeline(prev =>
                              prev.map((t, i) =>
                                i === idx ? { ...t, ongoing: val, endDate: val ? undefined : t.endDate } : t
                              )
                            );
                          }}
                          className="rounded text-primary focus:ring-primary h-3.5 w-3.5"
                        />
                        <span className="text-[10px] text-faint font-body">Ongoing</span>
                      </label>
                    </div>
                    {!item.ongoing && (
                      <div className="flex gap-2 items-center">
                        <span className="text-[10px] text-faint whitespace-nowrap font-body">End Date:</span>
                        <input
                          type="month"
                          value={item.endDate || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditedTimeline(prev =>
                              prev.map((t, i) => (i === idx ? { ...t, endDate: val } : t))
                            );
                          }}
                          className="w-full bg-background border border-border rounded px-1.5 py-0.5 text-[11px] text-foreground focus:outline-none"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-faint">Interests/Focus</label>
            <TagEditor
              tags={editedInterests}
              onChange={setEditedInterests}
              placeholder="e.g. Immunotherapy"
            />
          </div>
        </div>
      </form>
    );
  }

  const rows: Array<{ label: string; value: string | number | null }> = [
    { label: "Age", value: profile.age },
    { label: "Sex", value: formatSex(profile.sex) },
    { label: "Diagnosis", value: profile.primaryDiagnosis },
    { label: "Stage", value: profile.stage },
    { label: "Location", value: formatLocationDisplay(profile.location) },
    {
      label: "Biomarkers",
      value:
        profile.biomarkers.length > 0 ? profile.biomarkers.join(", ") : null,
    },
    {
      label: "Past treatments",
      value:
        profile.priorTreatments.length > 0
          ? profile.priorTreatments.join(", ")
          : null,
    },
    {
      label: "Metastasis",
      value:
        profile.hasMetastaticDisease === false
          ? "None noted"
          : profile.hasMetastaticDisease === true
          ? "Present"
          : null,
    },
    {
      label: "Looking for",
      value:
        profile.interests.length > 0 ? profile.interests.join(", ") : null,
    },
  ];

  return (
    <section aria-labelledby="profile-heading">
      <div className="flex items-center justify-between mb-1.5">
        <h2
          id="profile-heading"
          className="font-display text-xl text-foreground text-pretty font-semibold"
        >
          What we understood
        </h2>
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="text-xs font-semibold text-primary border border-primary/20 hover:bg-muted hover:border-primary/40 rounded px-2.5 py-1 bg-surface transition-colors focus:outline-none focus:ring-1 focus:ring-primary font-body"
        >
          Edit Details
        </button>
      </div>
      <p className="section-hint mb-5 font-body">
        Please confirm these details look right before you review any trials.
      </p>

      <dl>
        {rows.map((row) => (
          <div key={row.label} className="profile-row">
            <dt className="profile-label">{row.label}</dt>
            <dd className="profile-value">
              {row.value ?? (
                <span className="text-faint italic font-body">Not mentioned in notes</span>
              )}
            </dd>
          </div>
        ))}
      </dl>

      {profile.priorTreatmentsTimeline && profile.priorTreatmentsTimeline.length > 0 && (
        <div className="mt-5 pt-4 border-t border-border-subtle">
          <span className="block text-xs font-semibold text-foreground mb-3 flex items-center gap-1 font-body">⏱️ Treatment Timeline</span>
          <div className="relative border-l border-border pl-4 space-y-3.5 ml-1.5">
            {profile.priorTreatmentsTimeline.map((item, idx) => {
              const dateStr = item.ongoing
                ? "Ongoing"
                : item.endDate
                ? `Completed ${item.endDate}`
                : "Date unspecified";
              return (
                <div key={idx} className="relative">
                  <span
                    className={`absolute -left-[20.5px] top-1 h-2 w-2 rounded-full border border-surface ${
                      item.ongoing ? "bg-accent" : "bg-primary"
                    }`}
                  ></span>
                  <span className="text-xs font-bold text-foreground block leading-tight font-body">{item.name}</span>
                  <span className="text-[10px] text-faint block font-body">{dateStr}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function RegistryStatus({
  summaries,
}: {
  summaries: MatchResponse["registrySummaries"];
}) {
  const available = summaries.filter((s) => !s.error && s.trialCount > 0);
  const unavailable = summaries.filter((s) => s.error);

  return (
    <section aria-labelledby="sources-heading" className="info-card">
      <h2 id="sources-heading" className="section-label">
        Where we searched
      </h2>
      <ul className="mt-3 space-y-2">
        {summaries.map((summary) => (
          <li
            key={summary.registry}
            className="flex flex-wrap items-baseline justify-between gap-2"
          >
            <span className="registry-chip">{summary.registry}</span>
            <span className="section-hint text-sm font-body">
              {summary.error
                ? "Could not reach this registry"
                : summary.trialCount === 0
                  ? "No matching trials found"
                  : `${summary.trialCount} ${summary.trialCount === 1 ? "trial" : "trials"} found`}
            </span>
          </li>
        ))}
      </ul>
      {unavailable.length > 0 && available.length > 0 && (
        <p className="section-hint text-xs mt-4 pt-4 border-t border-border-subtle font-body">
          Some registries were unavailable, but results below include trials from
          the sources that responded.
        </p>
      )}
    </section>
  );
}

function generatePersonalizedQuestions(profile: PatientProfile, trial: MatchedTrial): string[] {
  const qs = [
    `What are the chances of success for a Phase ${trial.phase} study compared to my current treatment plan?`,
  ];
  if (profile.biomarkers.length > 0) {
    qs.push(`Does this trial specifically target my biomarkers (${profile.biomarkers.join(", ")})?`);
  }
  if (profile.priorTreatments.length > 0) {
    qs.push(`Since I previously received ${profile.priorTreatments.join(", ")}, will that interfere with my eligibility or response in this study?`);
  }
  if (profile.stage) {
    qs.push(`Is this trial designed for patients at cancer Stage ${profile.stage}?`);
  }
  if (trial.locations.length > 0) {
    qs.push(`Where would I need to travel for treatments and check-ups, and is travel support available?`);
  }
  return qs;
}

function TrialCard({
  trial,
  index,
  isSaved,
  onSaveToggle,
}: {
  trial: MatchedTrial;
  index: number;
  isSaved: boolean;
  onSaveToggle: () => void;
}) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [simpleSummary, setSimpleSummary] = useState<string | null>(null);
  const [loadingSimple, setLoadingSimple] = useState(false);
  const bd = trial.scoreBreakdown;

  const handleSimplify = async () => {
    if (simpleSummary) {
      setSimpleSummary(null);
      return;
    }
    setLoadingSimple(true);
    try {
      const simplified = await getSimplifiedSummaryAction(trial.trialId, trial.summary);
      setSimpleSummary(simplified);
    } catch (err) {
      console.error(err);
      setSimpleSummary("Failed to generate simplified summary. Please try again.");
    } finally {
      setLoadingSimple(false);
    }
  };

  return (
    <li
      className="trial-card trial-enter font-body"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <article aria-labelledby={`trial-title-${trial.trialId}`}>
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="registry-chip">{trial.registry}</span>
              <span className="status-pill-open">
                {formatTrialStatus(trial.status)}
              </span>
              {trial.phase !== "Not specified" && (
                <span className="section-hint text-xs font-body">
                  {trial.phase}
                </span>
              )}
              {trial.distance !== null && (
                <span className="inline-flex items-center gap-1 text-xs text-primary bg-primary/5 border border-primary/10 px-2 py-0.5 rounded font-medium">
                  📍 {trial.distance} miles away
                </span>
              )}
            </div>

            <h3
              id={`trial-title-${trial.trialId}`}
              className="font-display text-lg sm:text-xl text-foreground leading-snug text-pretty font-semibold"
            >
              {trial.title}
            </h3>

            <p className="section-hint mt-3 leading-relaxed break-words font-body">
              {trial.summary}
              {trial.summary.length >= 400 && "…"}
            </p>

            {simpleSummary && (
              <div className="mt-3 p-3.5 bg-primary/5 border border-primary/10 rounded-lg text-xs leading-relaxed text-body-muted">
                <span className="font-semibold text-primary block mb-1">✨ Patient-Friendly AI Explanation:</span>
                {simpleSummary}
              </div>
            )}

            {trial.biomarkerGates && trial.biomarkerGates.length > 0 && (
              <div className="mt-3.5 p-3.5 bg-primary/5 border border-primary/10 rounded-xl text-xs space-y-2.5">
                <span className="font-semibold text-primary flex items-center gap-1.5">
                  🧬 Biomarker logic gate verification
                </span>
                <div className="flex flex-wrap gap-2.5">
                  {trial.biomarkerGates.map((gate, idx) => (
                    <div
                      key={idx}
                      className={`inline-flex flex-col p-2.5 rounded-lg border text-xs bg-surface ${
                        gate.passed
                          ? "border-emerald-500/20 text-emerald-800 dark:text-emerald-400"
                          : "border-amber-500/20 text-amber-800 dark:text-amber-400"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-4 font-bold border-b border-border-subtle pb-1 mb-1">
                        <span>Gate: {gate.gateType}</span>
                        <span className={gate.passed ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
                          {gate.passed ? "Passed ✓" : "Failed ✗"}
                        </span>
                      </div>
                      <div className="space-y-1">
                        {gate.rules.map((rule, ridx) => (
                          <div key={ridx} className="flex justify-between gap-4 text-[10px] text-faint">
                            <span>{rule.marker} ({rule.expected})</span>
                            <span className={`font-semibold capitalize ${
                              rule.status === "matched" ? "text-emerald-600 dark:text-emerald-400" : rule.status === "mismatched" ? "text-rose-600" : "text-faint"
                            }`}>{rule.status}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {trial.washoutChecks && trial.washoutChecks.length > 0 && (
              <div className="mt-3.5 p-3.5 bg-primary/5 border border-primary/10 rounded-xl text-xs space-y-2.5">
                <span className="font-semibold text-primary flex items-center gap-1.5">
                  ⏱️ Washout period compatibility check
                </span>
                <div className="space-y-2">
                  {trial.washoutChecks.map((check, idx) => (
                    <div
                      key={idx}
                      className={`flex items-center justify-between p-2.5 rounded-lg border text-xs bg-surface ${
                        check.status === "eligible"
                          ? "border-emerald-500/20 text-emerald-800 dark:text-emerald-400"
                          : check.status === "ineligible"
                          ? "border-rose-500/20 text-rose-800 dark:text-rose-400"
                          : "border-amber-500/20 text-amber-800 dark:text-amber-400"
                      }`}
                    >
                      <div>
                        <span className="font-semibold text-foreground">{check.treatmentName}</span> Washout:{" "}
                        <span className="font-mono font-medium text-foreground">{check.requiredDays} days required</span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-bold">
                        {check.status === "eligible" && (
                          <span className="text-emerald-600 dark:text-emerald-400 font-body">Eligible ({check.actualDays} days elapsed) ✓</span>
                        )}
                        {check.status === "ineligible" && (
                          <span className="text-rose-600 dark:text-rose-400 font-body">Ineligible ({check.actualDays} days elapsed) ✗</span>
                        )}
                        {check.status === "unknown" && (
                          <span className="text-amber-600 dark:text-amber-400 font-body">Date Unspecified (clarify with doctor) ⚠️</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {trial.locations.length > 0 && (
              <div className="mt-4">
                <p className="section-label text-xs mb-1.5">
                  Study locations
                </p>
                <ul className="space-y-1">
                  {trial.locations.map((loc, i) => (
                    <li
                      key={`${trial.trialId}-loc-${i}`}
                      className="section-hint text-sm break-words font-body"
                    >
                      {[loc.facility, loc.city, loc.state, loc.country]
                        .filter(Boolean)
                        .join(", ")}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="shrink-0 flex sm:flex-col items-center sm:items-end gap-3 sm:gap-2">
            <button
              type="button"
              onClick={() => setShowBreakdown(!showBreakdown)}
              className={`${matchBadgeClass(trial.matchScore)} cursor-pointer transition-transform hover:scale-[1.03] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2`}
              aria-label={`Match score: ${trial.matchScore}%. Click to view breakdown.`}
            >
              <span className="match-score-num">
                {trial.matchScore}%
              </span>
              <span className="match-score-label flex items-center gap-0.5">
                {matchLabel(trial.matchScore)}
                <span className="text-[9px] opacity-70 transition-transform duration-200" style={{ transform: showBreakdown ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
              </span>
            </button>

            <button
              type="button"
              onClick={handleSimplify}
              disabled={loadingSimple}
              className="btn-secondary text-xs w-full py-1.5 flex items-center justify-center gap-1 disabled:opacity-50 font-body"
            >
              {loadingSimple ? "Simplifying..." : simpleSummary ? "Hide AI Summary" : "✨ Simplify with AI"}
            </button>

            <button
              type="button"
              onClick={onSaveToggle}
              className={`text-xs w-full py-1.5 border rounded-lg font-medium transition-colors font-body ${
                isSaved
                  ? "bg-accent border-accent text-on-primary hover:bg-accent-dark hover:border-accent-dark"
                  : "bg-surface border-border text-primary hover:bg-muted"
              }`}
            >
              {isSaved ? "Saved to Board" : "Save to Board"}
            </button>

            <a
              href={safeUrl(trial.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary text-sm whitespace-nowrap font-body w-full text-center"
            >
              View details
            </a>
          </div>
        </div>

        {showBreakdown && bd && (
          <div className="mt-5 p-4 bg-muted/40 border border-border-subtle rounded-xl text-xs space-y-3 animate-fade-in">
            <div className="flex items-center justify-between border-b border-border-subtle pb-2 mb-1">
              <span className="font-semibold text-foreground text-sm">Matching Score Breakdown</span>
              <button 
                type="button" 
                onClick={() => setShowBreakdown(false)}
                className="text-faint hover:text-foreground text-base font-semibold leading-none"
              >
                &times;
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-faint">
              <div className="flex justify-between py-1 border-b border-border-subtle/40">
                <span>Baseline Score (standard for condition match)</span>
                <span className="font-mono text-foreground font-semibold">+{bd.baseline}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border-subtle/40">
                <span>Diagnosis Text Similarity Match</span>
                <span className="font-mono text-foreground font-semibold">+{bd.diagnosisMatch}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border-subtle/40">
                <span>Biomarkers Matching</span>
                <span className="font-mono text-foreground font-semibold">+{bd.biomarkerMatch}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border-subtle/40">
                <span>Biomarker Disqualifier Penalties</span>
                <span className={`font-mono font-semibold ${bd.biomarkerPenalties > 0 ? "text-destructive" : "text-foreground"}`}>
                  {bd.biomarkerPenalties > 0 ? `-${bd.biomarkerPenalties}` : "0"}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-border-subtle/40">
                <span>Interests & Targets Match</span>
                <span className="font-mono text-foreground font-semibold">+{bd.interestsMatch}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border-subtle/40">
                <span>Prior Treatments Alignment</span>
                <span className="font-mono text-foreground font-semibold">+{bd.priorTreatmentsMatch}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border-subtle/40">
                <span>Cancer Stage Specificity Match</span>
                <span className="font-mono text-foreground font-semibold">+{bd.stageMatch}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border-subtle/40">
                <span>Stage Penalties (metastatic conflicts)</span>
                <span className={`font-mono font-semibold ${bd.stagePenalties > 0 ? "text-destructive" : "text-foreground"}`}>
                  {bd.stagePenalties > 0 ? `-${bd.stagePenalties}` : "0"}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-border-subtle/40">
                <span>Study Phase Bonus (II/III/IV)</span>
                <span className="font-mono text-foreground font-semibold">+{bd.phaseBonus}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border-subtle/40">
                <span>Regional/Location Match</span>
                <span className="font-mono text-foreground font-semibold">+{bd.locationMatch}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border-subtle/40">
                <span>Patient Gender Matching</span>
                <span className={`font-mono font-semibold ${bd.sexMatch < 0 ? "text-destructive" : "text-foreground"}`}>
                  {bd.sexMatch >= 0 ? `+${bd.sexMatch}` : bd.sexMatch}
                </span>
              </div>
              {bd.biomarkerGatesMatch !== undefined && bd.biomarkerGatesMatch > 0 && (
                <div className="flex justify-between py-1 border-b border-border-subtle/40">
                  <span>Biomarker Logic Gate Match Bonus</span>
                  <span className="font-mono text-foreground font-semibold">+{bd.biomarkerGatesMatch}</span>
                </div>
              )}
              {bd.washoutPenalties !== undefined && bd.washoutPenalties > 0 && (
                <div className="flex justify-between py-1 border-b border-border-subtle/40">
                  <span>Prior Treatment Washout Penalties</span>
                  <span className="font-mono text-destructive font-semibold font-body">-{bd.washoutPenalties}</span>
                </div>
              )}
              <div className="flex justify-between py-1 border-b border-border-subtle/40 font-semibold text-foreground bg-primary/5 px-2 rounded mt-1">
                <span>Total Match Score</span>
                <span className="font-mono text-primary font-bold text-sm">{trial.matchScore}%</span>
              </div>
            </div>
          </div>
        )}
      </article>
    </li>
  );
}

function ProfileSelector({
  currentProfile,
  onSelectProfile,
}: {
  currentProfile: PatientProfile;
  onSelectProfile: (profile: PatientProfile) => void;
}) {
  const [profiles, setProfiles] = useState<Array<{ id: string; name: string; profile: PatientProfile }>>([]);
  const [profileNameInput, setProfileNameInput] = useState("");
  const [showSaveModal, setShowSaveModal] = useState(false);

  useEffect(() => {
    const loaded = localStorage.getItem("saved_profiles");
    if (loaded) {
      try {
        setProfiles(JSON.parse(loaded));
      } catch (e) {
        console.error("Failed to load saved profiles:", e);
      }
    }
  }, []);

  const saveCurrentProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileNameInput.trim()) return;

    const newProfile = {
      id: Math.random().toString(36).substring(2, 9),
      name: profileNameInput.trim(),
      profile: currentProfile,
      timestamp: Date.now()
    };

    const updated = [...profiles, newProfile];
    setProfiles(updated);
    localStorage.setItem("saved_profiles", JSON.stringify(updated));
    setProfileNameInput("");
    setShowSaveModal(false);
    alert("Patient profile saved successfully!");
  };

  return (
    <div className="info-card space-y-3">
      <div className="flex justify-between items-center border-b border-border-subtle pb-2">
        <h3 className="section-label">Saved Profiles</h3>
        <button
          type="button"
          onClick={() => setShowSaveModal(true)}
          className="text-xs font-semibold text-primary hover:underline cursor-pointer"
        >
          + Save Current
        </button>
      </div>

      {profiles.length > 0 ? (
        <select
          onChange={(e) => {
            const selected = profiles.find(p => p.id === e.target.value);
            if (selected) {
              sessionStorage.setItem("clinical_profile", JSON.stringify(selected.profile));
              sessionStorage.removeItem("clinical_notes");
              onSelectProfile(selected.profile);
            }
          }}
          className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-xs text-foreground focus:ring-1 focus:ring-primary focus:outline-none font-body cursor-pointer"
          defaultValue=""
        >
          <option value="" disabled>Select a saved profile...</option>
          {profiles.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      ) : (
        <p className="text-xs text-faint italic font-body">No profiles saved yet.</p>
      )}

      {showSaveModal && (
        <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-surface border border-border-subtle p-5 rounded-2xl shadow-2xl max-w-sm w-full space-y-4">
            <h4 className="font-display text-base font-bold text-foreground">Save Patient Profile</h4>
            <p className="text-xs text-faint font-body">
              Enter a nickname to save this profile details locally in your browser.
            </p>
            <input
              type="text"
              placeholder="e.g. Grandma's Case"
              value={profileNameInput}
              onChange={(e) => setProfileNameInput(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:ring-1 focus:ring-primary focus:outline-none"
              required
            />
            <div className="flex justify-end gap-2 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setShowSaveModal(false)}
                className="px-3 py-2 border border-border rounded-lg hover:bg-muted text-faint transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveCurrentProfile}
                className="px-3 py-2 bg-primary text-on-primary rounded-lg hover:bg-secondary transition-colors cursor-pointer"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BiomarkerBooster({
  profile,
  onUpdate
}: {
  profile: PatientProfile;
  onUpdate: (updatedProfile: PatientProfile) => void;
}) {
  const diagnosis = profile.primaryDiagnosis.toLowerCase();
  const currentMarkers = new Set(profile.biomarkers.map(b => b.toLowerCase()));
  
  const suggestions: Array<{ marker: string; reason: string }> = [];

  const addSuggestion = (marker: string, reason: string) => {
    if (!currentMarkers.has(marker.toLowerCase())) {
      suggestions.push({ marker, reason });
    }
  };

  if (diagnosis.includes("breast")) {
    addSuggestion("ER negative", "Unlocks triple-negative or hormone-receptor targeted trials");
    addSuggestion("ER positive", "Matches with endocrine or CDK4/6 inhibitor trials");
    addSuggestion("PIK3CA positive", "Qualifies for PI3K alpha-selective inhibitor studies");
    addSuggestion("BRCA1 positive", "Unlocks PARP inhibitor trials (olaparib/talazoparib)");
    addSuggestion("BRCA2 positive", "Unlocks PARP inhibitor trials (olaparib/talazoparib)");
  } else if (diagnosis.includes("lung") || diagnosis.includes("nsclc")) {
    addSuggestion("EGFR positive", "Matches with 3rd-generation EGFR TKIs (osimertinib)");
    addSuggestion("ALK positive", "Matches with ALK inhibitors (alectinib/lorlatinib)");
    addSuggestion("KRAS positive", "Matches with KRAS G12C/G12D targeted therapies");
    addSuggestion("RET positive", "Unlocks selective RET inhibitor studies (selpercatinib)");
    addSuggestion("ROS1 positive", "Matches with ROS1 targeted therapies");
    addSuggestion("PD-L1 positive", "Matches with frontline immunotherapy checkpoint inhibitors");
  } else if (diagnosis.includes("colon") || diagnosis.includes("colorectal")) {
    addSuggestion("KRAS wild-type", "Confirms eligibility for anti-EGFR antibodies (cetuximab)");
    addSuggestion("BRAF positive", "Matches with BRAF V600E combination therapies");
    addSuggestion("MSI-high", "Matches with highly effective immunotherapy (pembrolizumab)");
  } else {
    addSuggestion("MSI-high", "Matches with tumor-agnostic immunotherapy trials");
    addSuggestion("NTRK positive", "Qualifies for TRK inhibitor therapies (larotrectinib)");
    addSuggestion("TMB-high", "Matches with checkpoint immunotherapy studies");
  }

  if (suggestions.length === 0) return null;

  const handleAddMarker = (marker: string) => {
    const updatedProfile = {
      ...profile,
      biomarkers: [...profile.biomarkers, marker]
    };
    onUpdate(updatedProfile);
    alert(`Added "${marker}" to biomarkers. Re-calculating matches...`);
  };

  return (
    <div className="info-card space-y-3 bg-primary/5 border border-primary/10 text-left">
      <div className="flex items-center gap-1.5 border-b border-primary/10 pb-2">
        <span className="text-sm">💡</span>
        <h3 className="section-label text-primary font-bold">Match Booster</h3>
      </div>
      <p className="text-[11px] text-faint leading-relaxed font-body">
        Studies in your diagnosis category often require these tests. Add them if you know the results to see more matches:
      </p>
      <ul className="space-y-2.5 pt-1">
        {suggestions.slice(0, 3).map((s, idx) => (
          <li key={idx} className="flex justify-between items-start gap-3 bg-surface p-2 rounded-lg border border-border-subtle text-[11px] font-body font-medium">
            <div className="space-y-0.5">
              <span className="font-bold text-foreground block">{s.marker}</span>
              <span className="text-[10px] text-faint block leading-tight font-normal">{s.reason}</span>
            </div>
            <button
              type="button"
              onClick={() => handleAddMarker(s.marker)}
              className="text-[10px] text-primary hover:bg-primary/10 border border-primary/20 rounded px-1.5 py-0.5 font-bold transition-colors shrink-0 cursor-pointer"
            >
              + Add
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ResultsDashboard({
  data,
  onProfileUpdate,
  isUpdating,
}: ResultsDashboardProps) {
  const { profile, trials } = data;
  const [selectedRadius, setSelectedRadius] = useState<number | "anywhere">("anywhere");
  const [activeTab, setActiveTab] = useState<"results" | "board">("results");
  const [savedTrials, setSavedTrials] = useState<Array<{ trial: MatchedTrial; boardStatus: string }>>([]);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [newMatchesCount, setNewMatchesCount] = useState(0);
  const [lastSearchDate, setLastSearchDate] = useState<string | null>(null);

  useEffect(() => {
    const profileKey = `${profile.primaryDiagnosis}-${profile.age ?? ""}-${profile.sex}`;
    const stored = localStorage.getItem("last_seen_matches");
    let lastSeenData: Record<string, { count: number; trialIds: string[]; timestamp: number }> = {};
    if (stored) {
      try {
        lastSeenData = JSON.parse(stored);
      } catch (e) {
        console.error("Failed to parse last seen matches:", e);
      }
    }

    const currentIds = trials.map(t => t.trialId);
    const prev = lastSeenData[profileKey];

    if (prev) {
      const newIds = currentIds.filter(id => !prev.trialIds.includes(id));
      if (newIds.length > 0) {
        setNewMatchesCount(newIds.length);
        setLastSearchDate(new Date(prev.timestamp).toLocaleDateString());
      }
    }

    lastSeenData[profileKey] = {
      count: trials.length,
      trialIds: currentIds,
      timestamp: Date.now()
    };
    localStorage.setItem("last_seen_matches", JSON.stringify(lastSeenData));
  }, [profile, trials]);

  useEffect(() => {
    const saved = localStorage.getItem("saved_clinical_trials");
    if (saved) {
      try {
        setSavedTrials(JSON.parse(saved));
      } catch (err) {
        console.error("Failed to parse saved trials:", err);
      }
    }
  }, []);

  const saveToLocalStorage = (newSaved: Array<{ trial: MatchedTrial; boardStatus: string }>) => {
    setSavedTrials(newSaved);
    localStorage.setItem("saved_clinical_trials", JSON.stringify(newSaved));
  };

  const handleSaveToggle = (trial: MatchedTrial) => {
    const exists = savedTrials.find((t) => t.trial.trialId === trial.trialId);
    let newSaved;
    if (exists) {
      newSaved = savedTrials.filter((t) => t.trial.trialId !== trial.trialId);
    } else {
      newSaved = [...savedTrials, { trial, boardStatus: "saved" }];
    }
    saveToLocalStorage(newSaved);
  };

  const moveTrialStatus = (trialId: string, status: string) => {
    const newSaved = savedTrials.map((item) => {
      if (item.trial.trialId === trialId) {
        return { ...item, boardStatus: status };
      }
      return item;
    });
    saveToLocalStorage(newSaved);
  };

  const removeSavedTrial = (trialId: string) => {
    const newSaved = savedTrials.filter((item) => item.trial.trialId !== trialId);
    saveToLocalStorage(newSaved);
  };

  const filteredTrials = trials.filter((trial) => {
    if (selectedRadius === "anywhere") return true;
    if (trial.distance === null) return true;
    return trial.distance <= selectedRadius;
  });

  const columns = ["saved", "contacted", "screening", "enrolled", "disqualified"] as const;
  const colLabels: Record<typeof columns[number], string> = {
    saved: "Saved",
    contacted: "Contacted",
    screening: "Screening",
    enrolled: "Enrolled",
    disqualified: "Disqualified",
  };

  const handleExportCSV = () => {
    const headers = ["Title", "Registry", "TrialID", "Status", "Phase", "MatchScore", "BoardStatus"];
    const rows = savedTrials.map((item) => [
      `"${item.trial.title.replace(/"/g, '""')}"`,
      item.trial.registry,
      item.trial.trialId,
      item.trial.status,
      item.trial.phase,
      `${item.trial.matchScore}%`,
      item.boardStatus,
    ]);
    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "clinical_trials_saved_guide.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex-1">
          <p className="section-label text-primary">Matching Workspace</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
            <div className="flex bg-muted/60 p-1 rounded-lg border border-border-subtle">
              <button
                type="button"
                onClick={() => setActiveTab("results")}
                className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  activeTab === "results"
                    ? "bg-surface text-primary border border-border-subtle shadow-sm"
                    : "text-faint hover:text-primary"
                }`}
              >
                Matched Trials ({filteredTrials.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("board")}
                className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  activeTab === "board"
                    ? "bg-surface text-primary border border-border-subtle shadow-sm"
                    : "text-faint hover:text-primary"
                }`}
              >
                My Journey Board ({savedTrials.length})
              </button>
            </div>
            {isUpdating && (
              <span className="inline-flex items-center gap-1.5 text-xs text-primary font-semibold bg-muted/80 border border-primary/10 px-2 py-1 rounded-md animate-pulse">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                </span>
                Updating matches…
              </span>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          {savedTrials.length > 0 && (
            <button
              type="button"
              onClick={() => setShowGuideModal(true)}
              className="btn-secondary text-sm font-semibold whitespace-nowrap bg-primary/5 text-primary border border-primary/20 hover:bg-primary/10 flex items-center gap-1 font-body"
            >
              📋 Doctor Discussion Guide ({savedTrials.length})
            </button>
          )}
          <Link href="/" className="btn-secondary self-start shrink-0 font-body text-sm font-semibold">
            New search
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
        <aside className="lg:col-span-4 xl:col-span-3 space-y-6 lg:sticky lg:top-8">
          <ProfileSelector currentProfile={profile} onSelectProfile={onProfileUpdate} />
          <BiomarkerBooster profile={profile} onUpdate={onProfileUpdate} />
          <RegistryStatus summaries={data.registrySummaries} />

          {profile.location && activeTab === "results" && (
            <div className="info-card">
              <h3 className="section-label">Geospatial Search Radius</h3>
              <p className="section-hint text-xs mt-1 mb-3 font-body">Filter trials by distance from your location.</p>
              <div className="space-y-3">
                <input 
                  type="range" 
                  min="25" 
                  max="500" 
                  step="25"
                  value={selectedRadius === "anywhere" ? 500 : selectedRadius} 
                  onChange={(e) => setSelectedRadius(Number(e.target.value))}
                  className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <div className="flex justify-between items-center text-xs font-semibold text-primary font-body">
                  <span>25 mi</span>
                  <span className="bg-primary/10 px-2.5 py-0.5 rounded border border-primary/20 text-xs">
                    {selectedRadius === "anywhere" ? "Any distance" : `within ${selectedRadius} miles`}
                  </span>
                  <button 
                    type="button"
                    onClick={() => setSelectedRadius("anywhere")}
                    className="text-primary hover:underline font-bold text-xs"
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="chart-panel">
            <ProfileSummary profile={profile} onUpdate={onProfileUpdate} />
          </div>
        </aside>

        <div className="lg:col-span-8 xl:col-span-9">
          {activeTab === "results" ? (
            <div
              className={`transition-opacity duration-200 ${
                isUpdating ? "opacity-50 pointer-events-none" : "opacity-100"
              }`}
            >
              {filteredTrials.length === 0 ? (
                <div className="info-card text-center py-10">
                  <p className="font-display text-lg text-foreground">
                    No matching trials in range
                  </p>
                  <p className="section-hint mt-2 max-w-sm mx-auto font-body">
                    Try raising the search radius slider or modifying diagnosis, location, and biomarkers.
                  </p>
                </div>
              ) : (
                <section aria-labelledby="trials-heading">
                  <h2 id="trials-heading" className="sr-only">
                    Matching clinical trials
                  </h2>

                  {newMatchesCount > 0 && (
                    <div className="mb-5 p-4 bg-emerald-500/5 border border-emerald-500/20 text-emerald-800 dark:text-emerald-400 rounded-xl text-xs flex justify-between items-center font-body animate-fade-in">
                      <div>
                        <span className="font-bold block mb-0.5">🎉 New Trial Match Alert!</span>
                        <span>
                          We found <strong>{newMatchesCount} new matching {newMatchesCount === 1 ? "trial" : "trials"}</strong> registered since your last search on {lastSearchDate}.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setNewMatchesCount(0)}
                        className="text-emerald-800 dark:text-emerald-400 hover:text-foreground font-bold text-sm px-2 py-1 cursor-pointer"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}

                  <ol className="space-y-5" aria-label="Matching clinical trials">
                    {filteredTrials.map((trial, index) => (
                      <TrialCard
                        key={`${trial.registry}-${trial.trialId}`}
                        trial={trial}
                        index={index}
                        isSaved={Boolean(savedTrials.find((t) => t.trial.trialId === trial.trialId))}
                        onSaveToggle={() => handleSaveToggle(trial)}
                      />
                    ))}
                  </ol>

                  <p className="section-hint mt-8 text-xs max-w-2xl font-body">
                    Match scores are estimates based on your notes. A doctor or research
                    coordinator should confirm eligibility before enrolling.
                  </p>
                </section>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="info-card bg-surface border border-border-subtle p-4 rounded-xl">
                <h3 className="font-display text-lg font-semibold text-foreground">Your Clinical Trial Journey</h3>
                <p className="section-hint text-xs mt-1 font-body">
                  Track the recruitment status of your saved trials. States are synced locally to your browser.
                </p>
              </div>

              <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin">
                {columns.map((col) => {
                  const items = savedTrials.filter((t) => t.boardStatus === col);
                  return (
                    <div key={col} className="bg-muted/30 border border-border-subtle/50 rounded-xl p-3 min-w-[240px] flex-1 max-w-[320px]">
                      <div className="flex justify-between items-center border-b border-border-subtle pb-2 mb-3">
                        <span className="font-display text-sm font-semibold text-foreground flex items-center gap-1.5">
                          {colLabels[col]}
                          <span className="bg-muted text-primary text-[10px] font-bold px-2 py-0.5 rounded-full border border-border-subtle">
                            {items.length}
                          </span>
                        </span>
                      </div>

                      <ul className="space-y-3 min-h-[300px]">
                        {items.map((item) => (
                          <li key={item.trial.trialId} className="bg-surface border border-border-subtle p-3 rounded-lg shadow-sm space-y-2 font-body">
                            <span className="registry-chip">{item.trial.registry}</span>
                            <h4 className="font-display text-xs font-semibold text-foreground line-clamp-2 leading-tight">
                              {item.trial.title}
                            </h4>
                            <p className="text-[10px] text-faint font-medium">ID: {item.trial.trialId}</p>

                            <div className="space-y-1.5 pt-1.5 border-t border-border-subtle/50 mt-1">
                              <select
                                value={item.boardStatus}
                                onChange={(e) => moveTrialStatus(item.trial.trialId, e.target.value)}
                                className="bg-background border border-border text-[10px] rounded p-1 w-full font-medium focus:outline-none"
                              >
                                <option value="saved">Saved</option>
                                <option value="contacted">Contacted</option>
                                <option value="screening">Screening</option>
                                <option value="enrolled">Enrolled</option>
                                <option value="disqualified">Disqualified</option>
                              </select>

                              <button
                                type="button"
                                onClick={() => removeSavedTrial(item.trial.trialId)}
                                className="text-[10px] text-destructive hover:underline font-semibold block text-center w-full mt-1"
                              >
                                Remove from Board
                              </button>
                            </div>
                          </li>
                        ))}
                        {items.length === 0 && (
                          <li className="text-center py-12 border border-dashed border-border rounded-lg text-faint text-xs italic font-body">
                            No trials in this column
                          </li>
                        )}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {showGuideModal && (
        <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm flex justify-center items-center p-4 z-50 overflow-y-auto">
          <div id="print-area" className="bg-surface border border-border-subtle p-6 rounded-2xl max-w-4xl w-full shadow-2xl relative space-y-6 max-h-[90vh] overflow-y-auto">
            
            <div className="flex justify-between items-start border-b border-border-subtle pb-4 no-print">
              <div>
                <h3 className="font-display text-xl font-bold text-foreground">Doctor Discussion Guide</h3>
                <p className="section-hint text-xs mt-1 font-body">Personalized guide ready to print for your next clinical oncology appointment.</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="px-3 py-1.5 border border-border text-xs rounded-md hover:bg-muted font-semibold text-primary transition-colors font-body"
                >
                  Download CSV
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-primary hover:bg-secondary text-on-primary text-xs rounded-md font-semibold transition-colors font-body"
                >
                  Print Guide
                </button>
                <button
                  type="button"
                  onClick={() => setShowGuideModal(false)}
                  className="px-2.5 py-1.5 border border-border text-xs rounded-md hover:bg-muted font-semibold text-faint transition-colors font-body"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="hidden print:block border-b border-foreground pb-4">
              <h2 className="text-2xl font-bold text-foreground">Clinical Trial Matcher: Oncology Discussion Guide</h2>
              <p className="text-sm text-faint mt-1 font-body">Date: {new Date().toLocaleDateString()}</p>
            </div>

            <section className="space-y-3">
              <h4 className="font-display text-base font-bold text-foreground border-b border-border-subtle pb-1.5">Patient Clinical Profile</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm font-body">
                <div>
                  <span className="block text-xs font-semibold text-faint">Age / Sex</span>
                  <span className="font-medium text-foreground">{profile.age ?? "Not specified"} / {formatSex(profile.sex) ?? "Unknown"}</span>
                </div>
                <div>
                  <span className="block text-xs font-semibold text-faint">Primary Diagnosis</span>
                  <span className="font-medium text-foreground">{profile.primaryDiagnosis}</span>
                </div>
                <div>
                  <span className="block text-xs font-semibold text-faint">Cancer Stage</span>
                  <span className="font-medium text-foreground">{profile.stage ?? "Not specified"}</span>
                </div>
                <div>
                  <span className="block text-xs font-semibold text-faint">Biomarkers</span>
                  <span className="font-medium text-foreground">{profile.biomarkers.length > 0 ? profile.biomarkers.join(", ") : "None specified"}</span>
                </div>
                <div>
                  <span className="block text-xs font-semibold text-faint">Prior Treatments</span>
                  <span className="font-medium text-foreground">{profile.priorTreatments.length > 0 ? profile.priorTreatments.join(", ") : "None specified"}</span>
                </div>
                <div>
                  <span className="block text-xs font-semibold text-faint">Metastatic Status</span>
                  <span className="font-medium text-foreground">
                    {profile.hasMetastaticDisease === true ? "Metastatic" : profile.hasMetastaticDisease === false ? "Non-metastatic" : "Unknown"}
                  </span>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h4 className="font-display text-base font-bold text-foreground border-b border-border-subtle pb-1.5">Saved Trials to Discuss</h4>
              
              <ul className="space-y-6">
                {savedTrials.map((item) => {
                  const questions = generatePersonalizedQuestions(profile, item.trial);
                  return (
                    <li key={item.trial.trialId} className="border border-border-subtle rounded-xl p-4 space-y-3 bg-muted/10 page-break-avoid font-body">
                      <div className="flex justify-between items-baseline flex-wrap gap-2">
                        <span className="font-display text-sm font-bold text-foreground">{item.trial.title}</span>
                        <span className="text-xs text-primary font-bold">{item.trial.registry} • {item.trial.trialId} ({item.trial.phase})</span>
                      </div>
                      <p className="text-xs text-faint italic mt-1 font-body">{item.trial.summary}</p>
                      
                      <div className="pt-2">
                        <span className="text-xs font-bold text-primary block mb-1">Key Questions for the Doctor:</span>
                        <ul className="list-disc pl-5 text-xs text-body-muted space-y-1.5">
                          {questions.map((q, idx) => (
                            <li key={idx}>{q}</li>
                          ))}
                        </ul>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            <style>{`
              @media print {
                body {
                  background: white !important;
                  color: black !important;
                  font-size: 12px;
                }
                .no-print, header, footer, aside, button, select, Link, a.btn-secondary {
                  display: none !important;
                }
                #print-area {
                  border: none !important;
                  box-shadow: none !important;
                  padding: 0 !important;
                  max-height: none !important;
                  overflow: visible !important;
                  position: absolute;
                  left: 0;
                  top: 0;
                  width: 100%;
                }
                .page-break-avoid {
                  page-break-inside: avoid;
                }
              }
            `}</style>
          </div>
        </div>
      )}
    </div>
  );
}
