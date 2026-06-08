import Link from "next/link";
import { useState, useEffect, useTransition, useRef } from "react";
import {
  getSimplifiedSummaryAction,
  integrateWhoTrialsAction,
} from "@/app/actions/match";
import { queryWhoIctrpFromBrowser } from "@/lib/registries/who-ictrp-client";
import {
  formatTrialStatus,
  normalizeTrialSummary,
  stripEmDashes,
  truncateTrialSummary,
  TRIAL_SUMMARY_DISPLAY_MAX,
} from "@/lib/format";
import { formatLocationDisplay } from "@/lib/location";
import type {
  MatchResponse,
  PatientProfile,
  PatientLocation,
  MatchedTrial,
  TreatmentHistory,
  SimplifiedTrialGuide,
} from "@/lib/types";

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

function scoreRingClass(score: number): string {
  if (score >= 80) return "score-ring-high";
  if (score >= 55) return "score-ring-mid";
  return "score-ring-low";
}

const SCORE_RING_R = 18;
const SCORE_RING_C = 2 * Math.PI * SCORE_RING_R;

function ScoreRing({
  score,
  label,
  expanded,
  onClick,
}: {
  score: number;
  label: string;
  expanded: boolean;
  onClick: () => void;
}) {
  const dash = (score / 100) * SCORE_RING_C;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`score-ring ${scoreRingClass(score)}`}
      aria-label={`Match score: ${score}%. ${label}. Click to view breakdown.`}
      aria-expanded={expanded}
    >
      <div className="score-ring-chart">
        <svg viewBox="0 0 44 44" className="-rotate-90" aria-hidden="true">
          <circle
            cx="22"
            cy="22"
            r={SCORE_RING_R}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.18}
            strokeWidth="2"
          />
          <circle
            cx="22"
            cy="22"
            r={SCORE_RING_R}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray={`${dash} ${SCORE_RING_C}`}
            strokeLinecap="butt"
          />
        </svg>
        <span className="score-ring-value" aria-hidden="true">
          {score}
        </span>
      </div>
      <span className="score-ring-label">{label}</span>
    </button>
  );
}

function matchLabel(score: number): string {
  if (score >= 80) return "Strong match";
  if (score >= 55) return "Moderate match";
  return "Review recommended";
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
            className="inline-flex items-center gap-1 text-xs text-foreground font-body"
          >
            {tag}
            <button
              type="button"
              onClick={() => handleRemove(idx)}
              className="text-faint hover:text-destructive focus:outline-none text-sm leading-none"
              aria-label={`Remove ${tag}`}
            >
              &times;
            </button>
          </span>
        ))}
        {tags.length === 0 && (
          <span className="text-xs text-faint italic py-0.5">No entries</span>
        )}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || "Add entry"}
          className="field-input text-xs flex-1"
        />
        <button
          type="button"
          onClick={handleAdd}
          className="btn-ghost text-xs shrink-0"
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
        <div className="flex items-center justify-between pb-3 mb-2">
          <h2 className="font-display text-lg text-foreground">
            Edit patient profile
          </h2>
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="btn-ghost text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary text-xs min-h-9 px-4"
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
              className="field-input text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-faint mb-1">Sex</label>
            <select
              value={editedSex}
              onChange={(e) => setEditedSex(e.target.value as PatientProfile["sex"])}
              className="field-select text-xs"
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
              className="field-input text-xs"
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
              className="field-input text-xs"
            />
          </div>

          <div className="space-y-2.5 pt-2">
            <span className="block text-xs font-semibold text-faint">
              Location
            </span>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-faint mb-0.5">City</label>
                <input
                  type="text"
                  value={editedCity}
                  onChange={(e) => setEditedCity(e.target.value)}
                  className="field-input text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-faint mb-0.5">State/Prov</label>
                <input
                  type="text"
                  value={editedState}
                  onChange={(e) => setEditedState(e.target.value)}
                  placeholder="MA"
                  className="field-input text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-faint mb-0.5">Country</label>
                <input
                  type="text"
                  value={editedCountry}
                  onChange={(e) => setEditedCountry(e.target.value)}
                  className="field-input text-xs"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-faint mb-1">Metastasis</label>
            <select
              value={editedMetastasis}
              onChange={(e) => setEditedMetastasis(e.target.value)}
              className="field-select text-xs"
            >
              <option value="unknown">Unknown</option>
              <option value="yes">Metastatic disease present</option>
              <option value="no">No metastatic disease documented</option>
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
            <label className="block text-xs font-semibold text-faint">Prior therapies</label>
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
              <div className="mt-3.5 space-y-3 pt-2 divider">
                <span className="block text-xs font-bold text-faint font-body">
                  Therapy timeline
                </span>
                {editedTimeline.map((item, idx) => (
                  <div key={idx} className="space-y-1.5 py-2 border-b border-border-subtle text-xs last:border-0">
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
                        <span className="text-xs text-faint font-body">Ongoing</span>
                      </label>
                    </div>
                    {!item.ongoing && (
                      <div className="flex gap-2 items-center">
                        <span className="text-xs text-faint whitespace-nowrap font-body">End Date:</span>
                        <input
                          type="month"
                          value={item.endDate || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditedTimeline(prev =>
                              prev.map((t, i) => (i === idx ? { ...t, endDate: val } : t))
                            );
                          }}
                          className="field-input text-xs"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-faint">Treatment objectives</label>
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
          ? "Not documented"
          : profile.hasMetastaticDisease === true
          ? "Present"
          : null,
    },
    {
      label: "Objectives",
      value:
        profile.interests.length > 0 ? profile.interests.join(", ") : null,
    },
  ];

  return (
    <section aria-labelledby="profile-heading">
      <div className="flex items-center justify-between mb-1.5">
        <h2 id="profile-heading" className="subsection-title">
          Extracted profile
        </h2>
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="btn-ghost text-xs"
        >
          Edit profile
        </button>
      </div>
      <p className="section-hint mb-5 font-body">
        Verify this information before reviewing matched trials.
      </p>

      <dl className="profile-spec">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt>{row.label}</dt>
            <dd>
              {row.value ?? (
                <span className="text-faint italic">Not provided</span>
              )}
            </dd>
          </div>
        ))}
      </dl>

      {profile.priorTreatmentsTimeline && profile.priorTreatmentsTimeline.length > 0 && (
        <div className="mt-5 pt-4 border-t border-border-subtle">
          <span className="block text-xs font-medium text-faint mb-3 font-body uppercase tracking-wider">Treatment timeline</span>
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
                  <span className="text-xs text-faint block font-body">{dateStr}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

type WhoSearchState = "idle" | "loading" | "success" | "empty" | "error";

const REGISTRY_DETAILS: Record<
  MatchResponse["registrySummaries"][number]["registry"],
  { label: string; href: string }
> = {
  "ClinicalTrials.gov": {
    label: "ClinicalTrials.gov",
    href: "https://clinicaltrials.gov",
  },
  "EU-CTR": {
    label: "EU Clinical Trials Register",
    href: "https://www.clinicaltrialsregister.eu",
  },
  "WHO ICTRP": {
    label: "WHO International Trials Portal",
    href: "https://trialsearch.who.int",
  },
  ISRCTN: {
    label: "ISRCTN",
    href: "https://www.isrctn.com",
  },
};

function registryStatusMessage(
  summary: MatchResponse["registrySummaries"][number],
  whoSearchState: WhoSearchState
): { tone: "success" | "neutral" | "warning" | "loading"; text: string } {
  if (summary.registry === "WHO ICTRP" && whoSearchState === "loading") {
    return {
      tone: "loading",
      text: "Querying WHO ICTRP",
    };
  }

  if (summary.error && summary.error !== "WHO_ICTRP_BROWSER_REQUIRED") {
    return {
      tone: "warning",
      text: "Connection unavailable. Other registries included.",
    };
  }

  if (summary.registry === "WHO ICTRP" && whoSearchState === "error") {
    return {
      tone: "warning",
      text: "WHO search unavailable from this environment. See who.int directly.",
    };
  }

  if (summary.registry === "WHO ICTRP" && whoSearchState === "empty") {
    return {
      tone: "neutral",
      text: "No matching studies identified",
    };
  }

  if (summary.trialCount > 0) {
    return {
      tone: "success",
      text: `Found ${summary.trialCount} ${
        summary.trialCount === 1 ? "study" : "studies"
      } potentially eligible`,
    };
  }

  return {
    tone: "neutral",
    text: "No matches for your search right now",
  };
}

function RegistryStatus({
  summaries,
  whoSearchState,
}: {
  summaries: MatchResponse["registrySummaries"];
  whoSearchState: WhoSearchState;
}) {
  const responded = summaries.filter(
    (summary) =>
      summary.trialCount > 0 ||
      (summary.registry === "WHO ICTRP" && whoSearchState === "loading")
  );
  const totalFound = summaries.reduce(
    (count, summary) => count + summary.trialCount,
    0
  );

  return (
    <section aria-labelledby="sources-heading" className="pt-2">
      <h2 id="sources-heading" className="font-display text-xl text-foreground">
        Registry coverage
      </h2>
      <p className="section-hint mt-2 font-body leading-relaxed">
        {totalFound} {totalFound === 1 ? "study" : "studies"} identified across{" "}
        {summaries.length} registries prior to ranking.
      </p>

      <div className="registry-meter">
        {summaries.map((summary) => {
          const details = REGISTRY_DETAILS[summary.registry];
          const status = registryStatusMessage(summary, whoSearchState);
          const shortLabel =
            summary.registry === "ClinicalTrials.gov"
              ? "CT.gov"
              : summary.registry === "EU-CTR"
              ? "EU"
              : summary.registry === "WHO ICTRP"
              ? "WHO"
              : "ISRCTN";

          let fillClass = "registry-meter-fill";
          let fillWidth = `${Math.min(100, Math.max(12, summary.trialCount * 4))}%`;
          if (status.tone === "loading") {
            fillClass += " registry-meter-fill-loading";
            fillWidth = "30%";
          } else if (status.tone === "warning") {
            fillClass += " registry-meter-fill-warn";
            fillWidth = "20%";
          } else if (summary.trialCount === 0) {
            fillClass += " registry-meter-fill-empty";
            fillWidth = "8%";
          }

          return (
            <div key={summary.registry} className="registry-meter-row">
              <a
                href={details.href}
                target="_blank"
                rel="noopener noreferrer"
                className="registry-meter-label hover:text-primary transition-colors"
                title={details.label}
              >
                {shortLabel}
              </a>
              <div className="registry-meter-track" title={status.text}>
                <div
                  className={fillClass}
                  style={{ width: fillWidth }}
                />
              </div>
              <span className="registry-meter-count">
                {status.tone === "loading" ? "--" : summary.trialCount}
              </span>
            </div>
          );
        })}
      </div>

      {responded.length > 0 && responded.length < summaries.length && (
        <p className="section-hint text-xs mt-4 font-body leading-relaxed">
          One or more registries returned no results or were unavailable. Rankings reflect available data.
        </p>
      )}
    </section>
  );
}

function generatePersonalizedQuestions(profile: PatientProfile, trial: MatchedTrial): string[] {
  const qs = [
    `What is the expected efficacy of this Phase ${trial.phase} protocol relative to current standard of care?`,
  ];
  if (profile.biomarkers.length > 0) {
    qs.push(`Does eligibility require or target the following biomarkers: ${profile.biomarkers.join(", ")}?`);
  }
  if (profile.priorTreatments.length > 0) {
    qs.push(`How do prior therapies (${profile.priorTreatments.join(", ")}) affect eligibility and expected response?`);
  }
  if (profile.stage) {
    qs.push(`Is this protocol appropriate for patients at stage ${profile.stage}?`);
  }
  if (trial.locations.length > 0) {
    qs.push(`What travel is required for treatment and surveillance visits, and is logistical support available?`);
  }
  return qs;
}

function SimplifiedTrialGuideView({
  guide,
  onShowOriginal,
}: {
  guide: SimplifiedTrialGuide;
  onShowOriginal: () => void;
}) {
  return (
    <div className="mt-4 space-y-4">
      <p className="text-base text-foreground leading-relaxed font-body">
        {guide.headline}
      </p>

      {guide.goodFit && (
        <div className="callout">
          <p className="guide-heading mb-1">Clinical discussion points</p>
          <p>{guide.goodFit}</p>
        </div>
      )}

      {guide.studyBasics.length > 0 && (
        <div className="guide-block">
          <p className="guide-heading">Study overview</p>
          <ul className="space-y-1.5 text-sm text-foreground font-body list-disc pl-4">
            {guide.studyBasics.map((item) => (
              <li key={item} className="leading-relaxed">{item}</li>
            ))}
          </ul>
        </div>
      )}

      {guide.whatToExpect.length > 0 && (
        <div className="guide-block">
          <p className="guide-heading">Participation expectations</p>
          <ul className="space-y-1.5 text-sm text-foreground font-body list-disc pl-4">
            {guide.whatToExpect.map((item) => (
              <li key={item} className="leading-relaxed">{item}</li>
            ))}
          </ul>
        </div>
      )}

      {guide.goodToKnow && (
        <p className="text-sm text-faint leading-relaxed font-body">
          <span className="text-foreground">Important considerations: </span>
          {guide.goodToKnow}
        </p>
      )}

      {guide.askYourDoctor.length > 0 && (
        <div className="guide-block">
          <p className="guide-heading">Suggested consultation questions</p>
          <ul className="space-y-2 text-sm text-foreground font-body">
            {guide.askYourDoctor.map((q) => (
              <li key={q} className="leading-relaxed italic">{q}</li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="button"
        onClick={onShowOriginal}
        className="btn-ghost text-xs mt-2"
      >
        View source registry text
      </button>
    </div>
  );
}

function TrialCard({
  trial,
  profile,
  index,
  isSaved,
  onSaveToggle,
}: {
  trial: MatchedTrial;
  profile: PatientProfile;
  index: number;
  isSaved: boolean;
  onSaveToggle: () => void;
}) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [simplifiedGuide, setSimplifiedGuide] = useState<SimplifiedTrialGuide | null>(null);
  const [showOriginalSummary, setShowOriginalSummary] = useState(false);
  const [simplifyError, setSimplifyError] = useState<string | null>(null);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [isSimplifying, startSimplify] = useTransition();
  const bd = trial.scoreBreakdown;

  const fullSummary = normalizeTrialSummary(trial.summary);
  const isLongSummary = fullSummary.length > TRIAL_SUMMARY_DISPLAY_MAX;
  const displaySummary =
    summaryExpanded || !isLongSummary
      ? fullSummary
      : truncateTrialSummary(fullSummary);

  const handleSimplify = () => {
    setSimplifyError(null);
    setShowOriginalSummary(false);
    startSimplify(async () => {
      const result = await getSimplifiedSummaryAction({
        trialTitle: trial.title,
        trialSummary: trial.summary,
        trialPhase: trial.phase,
        trialStatus: trial.status,
        matchScore: trial.matchScore,
        profile,
      });

      if ("error" in result) {
        setSimplifyError(result.error);
        return;
      }

      setSimplifiedGuide(result.guide);
    });
  };

  const indexLabel = String(index + 1).padStart(2, "0");

  return (
    <li
      className="trial-card trial-enter font-body"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <article aria-labelledby={`trial-title-${trial.trialId}`} className="trial-entry">
        <span className="trial-index" aria-hidden="true">
          {indexLabel}
        </span>

        <div className="min-w-0 space-y-3">
          <p className="meta-strip">
            {[
              trial.registry,
              formatTrialStatus(trial.status),
              trial.phase !== "Not specified" ? trial.phase : null,
              trial.distance !== null ? `${trial.distance} mi` : null,
            ]
              .filter(Boolean)
              .join(", ")}
          </p>

          <h3
            id={`trial-title-${trial.trialId}`}
            className="trial-title"
          >
            {stripEmDashes(trial.title)}
          </h3>

            {simplifiedGuide && !showOriginalSummary ? (
              <SimplifiedTrialGuideView
                guide={simplifiedGuide}
                onShowOriginal={() => setShowOriginalSummary(true)}
              />
            ) : (
              <>
                <p className="section-hint mt-3 leading-relaxed break-words font-body">
                  {displaySummary}
                </p>
                {isLongSummary && (
                  <button
                    type="button"
                    onClick={() => setSummaryExpanded((prev) => !prev)}
                    className="text-xs font-semibold text-primary hover:underline mt-1 cursor-pointer font-body"
                  >
                    {summaryExpanded ? "Collapse" : "Expand summary"}
                  </button>
                )}
                {simplifiedGuide && showOriginalSummary && (
                  <button
                    type="button"
                    onClick={() => setShowOriginalSummary(false)}
                    className="text-xs font-semibold text-primary hover:underline mt-2 cursor-pointer font-body"
                  >
                    Return to patient summary
                  </button>
                )}
              </>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSimplify}
                disabled={isSimplifying}
                className="btn-ghost text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSimplifying
                  ? "Generating summary"
                  : simplifiedGuide
                    ? "Regenerate summary"
                    : "Generate patient summary"}
              </button>
              {simplifiedGuide && !showOriginalSummary && (
                <span className="text-xs text-faint font-body">
                  Profile-specific summary; not medical advice
                </span>
              )}
            </div>
            {simplifyError && (
              <p className="text-xs text-destructive mt-1 font-body">{simplifyError}</p>
            )}

            {trial.biomarkerGates && trial.biomarkerGates.length > 0 && (
              <div className="mt-5 text-xs space-y-3">
                <p className="guide-heading">Biomarker eligibility</p>
                <ul className="space-y-3">
                  {trial.biomarkerGates.map((gate, idx) => (
                    <li key={idx} className="space-y-1">
                      <p className="text-foreground font-medium">
                        {gate.gateType}{" "}
                        <span className="text-faint font-normal">
                          ({gate.passed ? "criteria met" : "criteria not met"})
                        </span>
                      </p>
                      <ul className="space-y-1 pl-3">
                        {gate.rules.map((rule, ridx) => (
                          <li key={ridx} className="flex justify-between gap-4 text-faint">
                            <span>{rule.marker} ({rule.expected})</span>
                            <span className="capitalize">{rule.status}</span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {trial.washoutChecks && trial.washoutChecks.length > 0 && (
              <div className="mt-5 text-xs space-y-2">
                <p className="guide-heading">Therapy washout period</p>
                <ul className="divide-y divide-border-subtle">
                  {trial.washoutChecks.map((check, idx) => (
                    <li key={idx} className="check-row">
                      <span>
                        <span className="font-medium text-foreground">{check.treatmentName}</span>
                        {" "}
                        requires {check.requiredDays}-day washout
                      </span>
                      <span className="text-faint">
                        {check.status === "eligible" && `Meets requirement (${check.actualDays} days elapsed)`}
                        {check.status === "ineligible" && `Does not meet requirement (${check.actualDays} days elapsed)`}
                        {check.status === "unknown" && "Insufficient date information"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {trial.locations.length > 0 && (
              <div className="mt-4">
                <p className="guide-heading mb-1.5">Study sites</p>
                <ul className="space-y-0.5">
                  {trial.locations.map((loc, i) => (
                    <li
                      key={`${trial.trialId}-loc-${i}`}
                      className="section-hint text-sm break-words"
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

        <div className="trial-actions">
          <ScoreRing
            score={trial.matchScore}
            label={matchLabel(trial.matchScore)}
            expanded={showBreakdown}
            onClick={() => setShowBreakdown(!showBreakdown)}
          />

          <div className="flex flex-col items-end gap-2 text-right">
            <button
              type="button"
              onClick={onSaveToggle}
              className={`btn-ghost text-xs min-h-9 px-3 py-1.5 ${
                isSaved ? "border-accent text-accent" : ""
              }`}
            >
              {isSaved ? "On shortlist" : "Add to shortlist"}
            </button>

            <a
              href={safeUrl(trial.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary text-xs whitespace-nowrap"
            >
              Open registry record
            </a>
          </div>
        </div>

        {showBreakdown && bd && (
          <div className="col-span-full mt-2 pt-5 border-t border-border-subtle text-xs space-y-3">
            <div className="flex items-center justify-between border-b border-border-subtle pb-2 mb-1">
              <span className="font-semibold text-foreground text-sm">Match score components</span>
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
                <span>Baseline (condition match)</span>
                <span className="font-mono text-foreground font-semibold">+{bd.baseline}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border-subtle/40">
                <span>Diagnosis similarity</span>
                <span className="font-mono text-foreground font-semibold">+{bd.diagnosisMatch}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border-subtle/40">
                <span>Biomarker alignment</span>
                <span className="font-mono text-foreground font-semibold">+{bd.biomarkerMatch}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border-subtle/40">
                <span>Biomarker exclusion penalties</span>
                <span className={`font-mono font-semibold ${bd.biomarkerPenalties > 0 ? "text-destructive" : "text-foreground"}`}>
                  {bd.biomarkerPenalties > 0 ? `-${bd.biomarkerPenalties}` : "0"}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-border-subtle/40">
                <span>Treatment objective alignment</span>
                <span className="font-mono text-foreground font-semibold">+{bd.interestsMatch}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border-subtle/40">
                <span>Prior therapy alignment</span>
                <span className="font-mono text-foreground font-semibold">+{bd.priorTreatmentsMatch}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border-subtle/40">
                <span>Disease stage alignment</span>
                <span className="font-mono text-foreground font-semibold">+{bd.stageMatch}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border-subtle/40">
                <span>Stage exclusion penalties</span>
                <span className={`font-mono font-semibold ${bd.stagePenalties > 0 ? "text-destructive" : "text-foreground"}`}>
                  {bd.stagePenalties > 0 ? `-${bd.stagePenalties}` : "0"}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-border-subtle/40">
                <span>Study phase weighting</span>
                <span className="font-mono text-foreground font-semibold">+{bd.phaseBonus}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border-subtle/40">
                <span>Geographic proximity</span>
                <span className="font-mono text-foreground font-semibold">+{bd.locationMatch}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border-subtle/40">
                <span>Sex eligibility alignment</span>
                <span className={`font-mono font-semibold ${bd.sexMatch < 0 ? "text-destructive" : "text-foreground"}`}>
                  {bd.sexMatch >= 0 ? `+${bd.sexMatch}` : bd.sexMatch}
                </span>
              </div>
              {bd.biomarkerGatesMatch !== undefined && bd.biomarkerGatesMatch > 0 && (
                <div className="flex justify-between py-1 border-b border-border-subtle/40">
                  <span>Biomarker gate bonus</span>
                  <span className="font-mono text-foreground font-semibold">+{bd.biomarkerGatesMatch}</span>
                </div>
              )}
              {bd.washoutPenalties !== undefined && bd.washoutPenalties > 0 && (
                <div className="flex justify-between py-1 border-b border-border-subtle/40">
                  <span>Washout period penalties</span>
                  <span className="font-mono text-destructive font-semibold font-body">-{bd.washoutPenalties}</span>
                </div>
              )}
              <div className="flex justify-between py-2 border-t border-border-subtle font-semibold text-foreground mt-1">
                <span>Composite match score</span>
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
    alert("Patient profile saved to local storage.");
  };

  return (
    <div className="space-y-3 pt-2">
      <div className="flex justify-between items-center pb-2">
        <h3 className="font-display text-lg text-foreground">Saved patient profiles</h3>
        <button
          type="button"
          onClick={() => setShowSaveModal(true)}
          className="text-xs font-semibold text-primary hover:underline cursor-pointer"
        >
          Save current
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
          className="field-select text-xs font-body"
          defaultValue=""
        >
          <option value="" disabled>Select a saved profile</option>
          {profiles.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      ) : (
        <p className="text-xs text-faint italic font-body">No saved profiles on this device.</p>
      )}

      {showSaveModal && (
        <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="modal-panel">
            <h4 className="font-display text-base font-bold text-foreground">Save patient profile</h4>
            <p className="text-xs text-faint font-body">
              Assign a label. Data is stored locally in this browser only.
            </p>
            <input
              type="text"
              placeholder="e.g. Case reference 2026-01"
              value={profileNameInput}
              onChange={(e) => setProfileNameInput(e.target.value)}
              className="field-input text-xs"
              required
            />
            <div className="flex justify-end gap-4 text-xs">
              <button
                type="button"
                onClick={() => setShowSaveModal(false)}
                className="btn-ghost text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveCurrentProfile}
                className="btn-primary text-xs min-h-9 px-4"
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
    addSuggestion("ER negative", "May expand eligibility for triple-negative and HR-negative trials");
    addSuggestion("ER positive", "Relevant for endocrine and CDK4/6 inhibitor protocols");
    addSuggestion("PIK3CA positive", "Required for PI3K-alpha inhibitor eligibility");
    addSuggestion("BRCA1 positive", "Enables PARP inhibitor trial consideration");
    addSuggestion("BRCA2 positive", "Enables PARP inhibitor trial consideration");
  } else if (diagnosis.includes("lung") || diagnosis.includes("nsclc")) {
    addSuggestion("EGFR positive", "Required for EGFR tyrosine kinase inhibitor trials");
    addSuggestion("ALK positive", "Required for ALK inhibitor protocols");
    addSuggestion("KRAS positive", "Relevant for KRAS G12C/G12D targeted studies");
    addSuggestion("RET positive", "Required for selective RET inhibitor trials");
    addSuggestion("ROS1 positive", "Required for ROS1-directed therapy studies");
    addSuggestion("PD-L1 positive", "Relevant for checkpoint inhibitor protocols");
  } else if (diagnosis.includes("colon") || diagnosis.includes("colorectal")) {
    addSuggestion("KRAS wild-type", "Required for anti-EGFR antibody eligibility");
    addSuggestion("BRAF positive", "Relevant for BRAF V600E combination protocols");
    addSuggestion("MSI-high", "Enables immunotherapy trial consideration");
  } else {
    addSuggestion("MSI-high", "Relevant for tumor-agnostic immunotherapy trials");
    addSuggestion("NTRK positive", "Required for TRK inhibitor protocols");
    addSuggestion("TMB-high", "Relevant for checkpoint immunotherapy studies");
  }

  if (suggestions.length === 0) return null;

  const handleAddMarker = (marker: string) => {
    const updatedProfile = {
      ...profile,
      biomarkers: [...profile.biomarkers, marker]
    };
    onUpdate(updatedProfile);
    alert(`"${marker}" added to biomarker profile. Refreshing match results.`);
  };

  return (
    <div className="pt-4 space-y-3 text-left divider">
      <h3 className="font-display text-lg text-foreground mt-4">Suggested biomarker testing</h3>
      <p className="text-xs text-faint leading-relaxed font-body">
        Trials for this diagnosis frequently require the following markers. Add confirmed results to refine matching:
      </p>
      <ul className="space-y-2.5 pt-1">
        {suggestions.slice(0, 3).map((s, idx) => (
          <li key={idx} className="flex justify-between items-start gap-3 py-2 border-b border-border-subtle text-xs font-body last:border-0">
            <div className="space-y-0.5">
              <span className="font-medium text-foreground block">{s.marker}</span>
              <span className="text-xs text-faint block leading-tight">{s.reason}</span>
            </div>
            <button
              type="button"
              onClick={() => handleAddMarker(s.marker)}
              className="btn-ghost text-xs shrink-0"
            >
              Add
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
  const [displayData, setDisplayData] = useState(data);
  const [whoSearchState, setWhoSearchState] = useState<WhoSearchState>("idle");
  const whoSearchStartedRef = useRef(false);
  const { profile, trials } = displayData;
  const [activeTab, setActiveTab] = useState<"results" | "board">("results");
  const [savedTrials, setSavedTrials] = useState<Array<{ trial: MatchedTrial; boardStatus: string }>>([]);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [newMatchesCount, setNewMatchesCount] = useState(0);
  const [lastSearchDate, setLastSearchDate] = useState<string | null>(null);

  useEffect(() => {
    setDisplayData(data);
    setWhoSearchState("idle");
    whoSearchStartedRef.current = false;
  }, [data]);

  useEffect(() => {
    const whoSummary = data.registrySummaries.find(
      (summary) => summary.registry === "WHO ICTRP"
    );
    const shouldSearchWho =
      whoSummary &&
      (whoSummary.error === "WHO_ICTRP_BROWSER_REQUIRED" ||
        whoSummary.trialCount === 0);

    if (!shouldSearchWho || whoSearchStartedRef.current) {
      return;
    }

    whoSearchStartedRef.current = true;
    let cancelled = false;
    setWhoSearchState("loading");

    const searchCondition =
      data.queryTerms.slice(0, 2).join(" ") ||
      data.profile.primaryDiagnosis ||
      "cancer";

    (async () => {
      try {
        const whoTrials = await queryWhoIctrpFromBrowser(searchCondition);
        if (cancelled) return;

        if (whoTrials.length === 0) {
          setWhoSearchState("empty");
          return;
        }

        const merged = await integrateWhoTrialsAction(
          whoTrials,
          data.profile,
          data
        );
        if (cancelled) return;

        setDisplayData(merged);
        setWhoSearchState("success");
      } catch {
        if (!cancelled) {
          setWhoSearchState("error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [data]);

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
    <div className="results-page space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex-1">
          <h2 className="section-title">
            Search results
            {data.mode && (
              <span className="font-body text-sm font-normal text-faint ml-2">
                ({data.mode === "patient" ? "patient" : "clinician"} mode)
              </span>
            )}
          </h2>
          <nav className="flex gap-6 mt-4 border-b border-border-subtle" aria-label="Results views">
            <button
              type="button"
              onClick={() => setActiveTab("results")}
              className={activeTab === "results" ? "mode-tab-active" : "mode-tab"}
            >
              Matched trials ({trials.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("board")}
              className={activeTab === "board" ? "mode-tab-active" : "mode-tab"}
            >
              Shortlist ({savedTrials.length})
            </button>
          </nav>
          {isUpdating && (
            <p className="text-xs text-faint mt-3 animate-pulse font-body">
              Refreshing match results
            </p>
          )}
        </div>

        <div className="flex gap-2">
          {savedTrials.length > 0 && (
            <button
              type="button"
              onClick={() => setShowGuideModal(true)}
              className="btn-secondary text-sm whitespace-nowrap font-body"
            >
              Consultation guide ({savedTrials.length})
            </button>
          )}
          <Link href="/" className="btn-secondary self-start shrink-0 font-body text-sm font-semibold">
            New search
          </Link>
        </div>
      </div>

      <div className="results-body">
        <aside className="lg:col-span-4 aside-rail results-sidebar space-y-6 order-1">
          <ProfileSummary profile={profile} onUpdate={onProfileUpdate} />
          <RegistryStatus
            summaries={displayData.registrySummaries}
            whoSearchState={whoSearchState}
          />
          <BiomarkerBooster profile={profile} onUpdate={onProfileUpdate} />
          <ProfileSelector currentProfile={profile} onSelectProfile={onProfileUpdate} />
        </aside>

        <div className="lg:col-span-8 order-2 min-w-0">
          {activeTab === "results" ? (
            <div
              className={`transition-opacity duration-200 ${
                isUpdating ? "opacity-50 pointer-events-none" : "opacity-100"
              }`}
            >
              {trials.length === 0 ? (
                <div className="py-16 text-center">
                  <p className="font-display text-2xl text-foreground">
                    No matching studies identified
                  </p>
                  <p className="section-hint mt-2 max-w-sm mx-auto font-body">
                    Consider broadening diagnosis, location, or biomarker criteria and search again.
                  </p>
                </div>
              ) : (
                <section aria-labelledby="trials-heading">
                  <h2 id="trials-heading" className="sr-only">
                    Matching clinical trials
                  </h2>

                  {newMatchesCount > 0 && (
                    <div className="callout mb-6 flex justify-between items-start gap-4 text-xs font-body">
                      <p>
                        <span className="font-medium text-foreground">Updated since {lastSearchDate}. </span>
                        {newMatchesCount} additional {newMatchesCount === 1 ? "study" : "studies"} identified since the prior search.
                      </p>
                      <button
                        type="button"
                        onClick={() => setNewMatchesCount(0)}
                        className="btn-ghost text-xs shrink-0"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}

                  <ol className="space-y-5" aria-label="Matching clinical trials">
                    {trials.map((trial, index) => (
                      <TrialCard
                        key={`${trial.registry}-${trial.trialId}`}
                        trial={trial}
                        profile={profile}
                        index={index}
                        isSaved={Boolean(savedTrials.find((t) => t.trial.trialId === trial.trialId))}
                        onSaveToggle={() => handleSaveToggle(trial)}
                      />
                    ))}
                  </ol>

                  <p className="section-hint mt-8 text-xs max-w-2xl font-body">
                    Match scores are algorithmic estimates based on submitted clinical information.
                    Eligibility must be confirmed by the treating physician or study coordinator.
                  </p>
                </section>
              )}
            </div>
          ) : (
            <div className="space-y-8">
              <div>
                <h3 className="font-display text-lg text-foreground">Trial shortlist</h3>
                <p className="section-hint text-xs mt-1 font-body">
                  Track recruitment status for each study. Data is stored locally in this browser.
                </p>
              </div>

              <div className="flex gap-10 overflow-x-auto pb-4">
                {columns.map((col) => {
                  const items = savedTrials.filter((t) => t.boardStatus === col);
                  return (
                    <div key={col} className="board-column">
                      <h4 className="board-column-title">
                        {colLabels[col]}{" "}
                        <span className="text-faint font-body font-normal">({items.length})</span>
                      </h4>

                      <ul className="space-y-0 min-h-[200px] divide-y divide-border-subtle">
                        {items.map((item) => (
                          <li key={item.trial.trialId} className="py-4 space-y-2 font-body first:pt-0">
                            <span className="registry-chip">{item.trial.registry}</span>
                            <h4 className="font-display text-xs text-foreground line-clamp-3 leading-snug">
                              {item.trial.title}
                            </h4>
                            <p className="text-xs text-faint">{item.trial.trialId}</p>

                            <select
                              value={item.boardStatus}
                              onChange={(e) => moveTrialStatus(item.trial.trialId, e.target.value)}
                              className="field-select text-xs mt-2"
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
                              className="text-xs text-destructive hover:underline block mt-1"
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                        {items.length === 0 && (
                          <li className="py-8 text-faint text-xs italic font-body">
                            No studies in this stage
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
          <div id="print-area" className="modal-panel-wide relative">
            
            <div className="flex justify-between items-start pb-4 divider no-print">
              <div>
                <h3 className="font-display text-xl text-foreground">Oncology consultation guide</h3>
                <p className="section-hint text-xs mt-1 font-body">Prepared for review at the next clinical appointment.</p>
              </div>
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="btn-ghost text-xs"
                >
                  Download CSV
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="btn-primary text-xs min-h-9 px-4"
                >
                  Print
                </button>
                <button
                  type="button"
                  onClick={() => setShowGuideModal(false)}
                  className="btn-ghost text-xs"
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
              <h4 className="font-display text-base font-bold text-foreground border-b border-border-subtle pb-1.5">Shortlisted studies for discussion</h4>
              
              <ul className="space-y-6">
                {savedTrials.map((item) => {
                  const questions = generatePersonalizedQuestions(profile, item.trial);
                  return (
                    <li key={item.trial.trialId} className="py-5 border-b border-border-subtle space-y-3 page-break-avoid font-body last:border-0">
                      <div className="flex justify-between items-baseline flex-wrap gap-2">
                        <span className="font-display text-sm text-foreground">{item.trial.title}</span>
                        <span className="text-xs text-faint">{item.trial.registry}, {item.trial.trialId} ({item.trial.phase})</span>
                      </div>
                      <p className="text-xs text-faint italic mt-1 font-body line-clamp-3">
                        {truncateTrialSummary(item.trial.summary)}
                      </p>
                      
                      <div className="pt-2">
                        <span className="text-xs font-medium text-faint block mb-1">Consultation questions</span>
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
