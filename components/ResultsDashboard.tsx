import Link from "next/link";
import { useState, useEffect, useMemo, useTransition, useRef } from "react";
import {
  getSimplifiedSummaryAction,
  integrateWhoTrialsAction,
  runEligibilityPanelAction,
} from "@/app/actions/match";
import type {
  EligibilityPanelResult,
  ReviewVerdict,
} from "@/lib/agents/eligibility-panel";
import { queryWhoIctrpFromBrowser } from "@/lib/registries/who-ictrp-client";
import {
  escapeCsvCell,
  formatTrialStatus,
  normalizeTrialSummary,
  stripEmDashes,
  truncateTrialSummary,
  TRIAL_SUMMARY_DISPLAY_MAX,
} from "@/lib/format";
import { formatLocationDisplay } from "@/lib/location";
import { parsePhaseRank } from "@/lib/registries/filters";
import {
  forecastTrialEligibility,
  formatForecastDate,
  summarizeForecasts,
  type EligibilityForecast,
  type ReadinessStatus,
} from "@/lib/eligibility-forecast";
import { buildIcsCalendar, type CalendarEvent } from "@/lib/ics";
import type {
  MatchResponse,
  PatientProfile,
  PatientLocation,
  MatchedTrial,
  TreatmentHistory,
  SimplifiedTrialGuide,
} from "@/lib/types";

const READINESS_RANK: Record<ReadinessStatus, number> = {
  "likely-eligible-now": 0,
  ready: 0,
  "action-needed": 1,
  upcoming: 2,
  "opens-later": 3,
  "not-a-match": 4,
  "likely-ineligible": 4,
};

const READINESS_FILTERS: Array<{ key: "all" | ReadinessStatus; label: string }> = [
  { key: "all", label: "All" },
  { key: "likely-eligible-now", label: "Likely eligible now" },
  { key: "action-needed", label: "Action needed" },
  { key: "opens-later", label: "Opens later" },
  { key: "not-a-match", label: "Not a match" },
];

function verdictLabel(v: ReviewVerdict): string {
  if (v === "likely-eligible") return "Likely eligible";
  if (v === "likely-ineligible") return "Likely ineligible";
  return "Uncertain";
}

function verdictChipClass(v: ReviewVerdict): string {
  if (v === "likely-eligible") return "readiness-ready";
  if (v === "likely-ineligible") return "readiness-ineligible";
  return "readiness-action";
}

function verdictTextClass(v: ReviewVerdict): string {
  if (v === "likely-eligible") return "verdict-pos";
  if (v === "likely-ineligible") return "verdict-neg";
  return "verdict-neutral";
}

function readinessChipClass(status: ReadinessStatus): string {
  switch (status) {
    case "likely-eligible-now":
    case "ready":
      return "readiness-ready";
    case "upcoming":
      return "readiness-upcoming";
    case "action-needed":
      return "readiness-action";
    case "opens-later":
      return "readiness-later";
    case "not-a-match":
    case "likely-ineligible":
      return "readiness-ineligible";
  }
}

function triggerDownload(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function buildReminderEvent(
  trial: MatchedTrial,
  forecast: EligibilityForecast
): CalendarEvent | null {
  if (forecast.status !== "upcoming" || !forecast.earliestDate) return null;
  return {
    uid: `${trial.registry}-${trial.trialId}@clinical-trial-matcher`,
    date: forecast.earliestDate,
    title: `Re-check trial eligibility: ${trial.title.slice(0, 80)}`,
    description: `A treatment washout window is projected to clear around ${formatForecastDate(
      forecast.earliestDate
    )}, which may open this study to you. Confirm eligibility with the study team.\nTrial ${trial.trialId} (${trial.registry}).`,
    url: trial.url,
  };
}

interface ResultsDashboardProps {
  data: MatchResponse;
  onProfileUpdate: (updatedProfile: PatientProfile) => void;
  isUpdating?: boolean;
}

function safeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return url;
    }
  } catch {
    // ignore
  }
  return "#";
}

function formatSex(sex: PatientProfile["sex"]): string {
  if (sex === "male") return "Male";
  if (sex === "female") return "Female";
  return "Unknown";
}

function matchLabel(score: number): string {
  if (score >= 80) return "Strong fit";
  if (score >= 60) return "Moderate fit";
  if (score >= 45) return "Potential fit";
  return "Review needed";
}

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
  return (
    <button
      type="button"
      onClick={onClick}
      className="score-group cursor-pointer text-right group focus:outline-none"
      title="Click to view score breakdown"
      aria-expanded={expanded}
    >
      <div className="flex items-baseline justify-end gap-1">
        <span className="score-value group-hover:text-primary transition-colors">
          {score}
        </span>
        <span className="score-denom">%</span>
      </div>
      <span className="score-fit-label flex items-center justify-end gap-1 group-hover:text-primary transition-colors">
        {label}
        <span
          className={`inline-block text-[10px] transform transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        >
          &#9662;
        </span>
      </span>
    </button>
  );
}

function TagEditor({
  tags,
  onChange,
  placeholder,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}) {
  const [inputVal, setInputVal] = useState("");

  const handleAdd = () => {
    const trimmed = inputVal.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
      setInputVal("");
    }
  };

  const handleRemove = (tagToRemove: string) => {
    onChange(tags.filter((t) => t !== tagToRemove));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 min-h-6">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-surface-muted text-foreground border border-border-subtle"
          >
            {tag}
            <button
              type="button"
              onClick={() => handleRemove(tag)}
              className="text-faint hover:text-destructive text-sm leading-none"
              aria-label={`Remove ${tag}`}
            >
              &times;
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder={placeholder || "Add item..."}
          className="field-input text-xs"
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
  const [editedSubtype, setEditedSubtype] = useState(profile.subtype ?? "");
  const [editedDuration, setEditedDuration] = useState(profile.diseaseDuration ?? "");
  const [editedStage, setEditedStage] = useState(profile.stage ?? "");
  const [editedCity, setEditedCity] = useState(profile.location?.city ?? "");
  const [editedState, setEditedState] = useState(profile.location?.state ?? "");
  const [editedCountry, setEditedCountry] = useState(profile.location?.country ?? "");
  const [editedBiomarkers, setEditedBiomarkers] = useState<string[]>(profile.biomarkers);
  const [editedPriorTreatments, setEditedPriorTreatments] = useState<string[]>(profile.priorTreatments);
  const [editedTimeline, setEditedTimeline] = useState<TreatmentHistory[]>(profile.priorTreatmentsTimeline || []);
  const [editedInterests, setEditedInterests] = useState<string[]>(profile.interests);

  useEffect(() => {
    setEditedAge(profile.age ?? "");
    setEditedSex(profile.sex);
    setEditedDiagnosis(profile.primaryDiagnosis);
    setEditedSubtype(profile.subtype ?? "");
    setEditedDuration(profile.diseaseDuration ?? "");
    setEditedStage(profile.stage ?? "");
    setEditedCity(profile.location?.city ?? "");
    setEditedState(profile.location?.state ?? "");
    setEditedCountry(profile.location?.country ?? "");
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
      ...profile,
      age: editedAge === "" ? null : Number(editedAge),
      sex: editedSex,
      primaryDiagnosis: editedDiagnosis.trim(),
      subtype: editedSubtype.trim() || null,
      diseaseDuration: editedDuration.trim() || null,
      stage: editedStage.trim() || null,
      location: updatedLocation,
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
            Edit clinical profile
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
            <label className="block text-xs font-semibold text-faint mb-1">Diagnosis</label>
            <input
              type="text"
              value={editedDiagnosis}
              onChange={(e) => setEditedDiagnosis(e.target.value)}
              className="field-input text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-faint mb-1">Subtype</label>
            <input
              type="text"
              value={editedSubtype}
              onChange={(e) => setEditedSubtype(e.target.value)}
              placeholder="e.g. Relapsing-Remitting MS (RRMS)"
              className="field-input text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-faint mb-1">Age</label>
              <input
                type="number"
                value={editedAge}
                onChange={(e) => setEditedAge(e.target.value === "" ? "" : Number(e.target.value))}
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
                <option value="unknown">Unknown</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-faint mb-1">Disease duration</label>
            <input
              type="text"
              value={editedDuration}
              onChange={(e) => setEditedDuration(e.target.value)}
              placeholder="e.g. approximately 4 years"
              className="field-input text-xs"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs font-semibold text-faint mb-1">City</label>
              <input
                type="text"
                value={editedCity}
                onChange={(e) => setEditedCity(e.target.value)}
                className="field-input text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-faint mb-1">State / Region</label>
              <input
                type="text"
                value={editedState}
                onChange={(e) => setEditedState(e.target.value)}
                className="field-input text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-faint mb-1">Country</label>
              <input
                type="text"
                value={editedCountry}
                onChange={(e) => setEditedCountry(e.target.value)}
                className="field-input text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-faint">Prior &amp; current therapies</label>
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
              placeholder="e.g. Dimethyl fumarate, Interferon beta-1a"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-faint">Biomarkers / Lab features</label>
            <TagEditor
              tags={editedBiomarkers}
              onChange={setEditedBiomarkers}
              placeholder="e.g. HER2 positive, Anti-JCV positive"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-faint">Treatment objectives</label>
            <TagEditor
              tags={editedInterests}
              onChange={setEditedInterests}
              placeholder="e.g. Disease-modifying treatments"
            />
          </div>
        </div>
      </form>
    );
  }

  const previousTreatmentsText = profile.previousTreatments && profile.previousTreatments.length > 0
    ? profile.previousTreatments.map(t => t.reasonDiscontinued ? `${t.name} (discontinued: ${t.reasonDiscontinued})` : t.name).join(", ")
    : null;

  const advancedTherapiesText = profile.priorAdvancedTherapies
    ? [
        profile.priorAdvancedTherapies.infusionDmt === false ? "No infusion DMT" : null,
        profile.priorAdvancedTherapies.stemCell === false ? "No stem-cell therapy" : null,
        profile.priorAdvancedTherapies.investigational === false ? "No investigational therapy" : null,
      ].filter(Boolean).join("; ")
    : null;

  const rows: Array<{ label: string; value: string | number | null }> = [
    { label: "Diagnosis", value: profile.primaryDiagnosis },
    { label: "Subtype", value: profile.subtype ?? null },
    { label: "Duration", value: profile.diseaseDuration ?? null },
    {
      label: "Symptoms / history",
      value: profile.symptoms && profile.symptoms.length > 0 ? profile.symptoms.join("; ") : null,
    },
    { label: "Current treatment", value: profile.currentTreatment ?? null },
    {
      label: "Previous treatment",
      value: previousTreatmentsText || (profile.priorTreatments.length > 0 ? profile.priorTreatments.join(", ") : null),
    },
    { label: "Recent activity", value: profile.recentDiseaseActivity ?? null },
    { label: "MRI findings", value: profile.mriFindings ?? null },
    { label: "Advanced therapies", value: advancedTherapiesText },
    { label: "Age", value: profile.age },
    { label: "Sex", value: formatSex(profile.sex) },
    { label: "Location", value: formatLocationDisplay(profile.location) },
    {
      label: "Biomarkers",
      value: profile.biomarkers.length > 0 ? profile.biomarkers.join(", ") : null,
    },
    {
      label: "Objectives",
      value: profile.interests.length > 0 ? profile.interests.join(", ") : null,
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
                : item.reasonDiscontinued
                ? `Discontinued (${item.reasonDiscontinued})`
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
    label: "EU registry",
    href: "https://www.clinicaltrialsregister.eu",
  },
  "WHO ICTRP": {
    label: "WHO ICTRP",
    href: "https://trialsearch.who.int",
  },
  ISRCTN: {
    label: "ISRCTN",
    href: "https://www.isrctn.com",
  },
};

function RegistryStatus({
  summaries,
  whoSearchState,
}: {
  summaries: MatchResponse["registrySummaries"];
  whoSearchState: WhoSearchState;
}) {
  const totalFound = summaries.reduce(
    (count, summary) => count + summary.trialCount,
    0
  );

  return (
    <section aria-labelledby="sources-heading" className="pt-2">
      <h2 id="sources-heading" className="font-display text-xl text-foreground">
        Registry coverage
      </h2>

      <div className="mt-3 space-y-2 font-mono text-xs">
        {summaries.map((summary) => {
          const details = REGISTRY_DETAILS[summary.registry];
          const isWhoLoading = summary.registry === "WHO ICTRP" && whoSearchState === "loading";
          const isError = Boolean(summary.error && summary.error !== "WHO_ICTRP_BROWSER_REQUIRED");
          const isUnavailable = isError || (summary.registry === "WHO ICTRP" && whoSearchState === "error");

          return (
            <div key={summary.registry} className="flex justify-between items-center py-1 border-b border-border-subtle/50 font-body">
              <a
                href={details.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground hover:text-primary transition-colors font-medium"
              >
                {details.label}
              </a>
              <span className={isUnavailable ? "text-destructive" : summary.trialCount > 0 ? "text-foreground font-semibold" : "text-faint"}>
                {isWhoLoading
                  ? "searching..."
                  : isUnavailable
                  ? "unavailable"
                  : `${summary.trialCount} candidate${summary.trialCount === 1 ? "" : "s"}`}
              </span>
            </div>
          );
        })}
      </div>

      <p className="section-hint mt-3 text-xs font-body leading-relaxed">
        <span className="font-semibold text-foreground">{totalFound}</span> candidate{" "}
        {totalFound === 1 ? "study" : "studies"} identified before ranking.
      </p>
    </section>
  );
}

function generatePersonalizedQuestions(
  profile: PatientProfile,
  trial: MatchedTrial
): string[] {
  const qs: string[] = [];
  qs.push(`Does my ${profile.primaryDiagnosis} diagnosis and clinical history meet this study's entry criteria?`);
  if (profile.subtype) {
    qs.push(`Is this protocol actively enrolling patients with ${profile.subtype}?`);
  }
  if (profile.currentTreatment) {
    qs.push(`How does my current therapy (${profile.currentTreatment}) transition into this trial protocol?`);
  }
  if (profile.priorTreatments && profile.priorTreatments.length > 0) {
    qs.push(`Do my prior treatments (${profile.priorTreatments.join(", ")}) satisfy prior therapy and washout requirements?`);
  }
  if (trial.locations.length > 0) {
    qs.push(`What travel or on-site visits are required for screening and administration at the nearest site?`);
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
  forecast,
  index,
  isSaved,
  onSaveToggle,
  onAddReminder,
}: {
  trial: MatchedTrial;
  profile: PatientProfile;
  forecast: EligibilityForecast;
  index: number;
  isSaved: boolean;
  onSaveToggle: () => void;
  onAddReminder: (trial: MatchedTrial, forecast: EligibilityForecast) => void;
}) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [simplifiedGuide, setSimplifiedGuide] = useState<SimplifiedTrialGuide | null>(null);
  const [showOriginalSummary, setShowOriginalSummary] = useState(false);
  const [simplifyError, setSimplifyError] = useState<string | null>(null);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [isSimplifying, startSimplify] = useTransition();
  const [panel, setPanel] = useState<EligibilityPanelResult | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [isRunningPanel, startPanel] = useTransition();
  const bd = trial.scoreBreakdown;

  const handleRunPanel = () => {
    setPanelError(null);
    startPanel(async () => {
      const result = await runEligibilityPanelAction({
        trialTitle: trial.title,
        trialSummary: trial.summary,
        trialEligibility: trial.eligibilityText ?? "",
        trialPhase: trial.phase,
        trialStatus: trial.status,
        profile,
      });
      if ("error" in result) {
        setPanelError(result.error);
        return;
      }
      setPanel(result.result);
    });
  };

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
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span
              className={`readiness-chip ${readinessChipClass(forecast.status)}`}
              title={forecast.summary}
            >
              <span className="readiness-dot" aria-hidden="true" />
              {forecast.label}
            </span>
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
          </div>

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

          {/* Match reasoning: Why this matched & What needs confirmation */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs bg-surface-muted/60 p-3 rounded-md border border-border-subtle">
            <div>
              <p className="font-semibold text-foreground mb-1.5 flex items-center gap-1">
                <span className="text-primary font-bold">&#10003;</span> Why this matched
              </p>
              <ul className="space-y-1 text-faint pl-4 list-disc">
                {(trial.reasonsMatched && trial.reasonsMatched.length > 0) ? (
                  trial.reasonsMatched.map((reason, idx) => (
                    <li key={idx}>{reason}</li>
                  ))
                ) : (
                  <li>Target condition aligns with clinical profile</li>
                )}
              </ul>
            </div>

            <div>
              <p className="font-semibold text-foreground mb-1.5 flex items-center gap-1">
                <span className="text-accent font-bold">&#9679;</span> What needs confirmation
              </p>
              <ul className="space-y-1 text-faint pl-4 list-disc">
                {(trial.reasonsToConfirm && trial.reasonsToConfirm.length > 0) ? (
                  trial.reasonsToConfirm.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))
                ) : (
                  <li>Confirm detailed laboratory and protocol eligibility with study site</li>
                )}
              </ul>
            </div>
          </div>

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
            <button
              type="button"
              onClick={handleRunPanel}
              disabled={isRunningPanel}
              className="btn-ghost text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRunningPanel
                ? "Convening review panel"
                : panel
                  ? "Re-run review panel"
                  : "Run eligibility review panel"}
            </button>
          </div>

          {panelError && (
            <p className="text-xs text-destructive mt-1 font-body">{panelError}</p>
          )}
          {simplifyError && (
            <p className="text-xs text-destructive mt-1 font-body">{simplifyError}</p>
          )}

          {trial.criteriaEvaluations && trial.criteriaEvaluations.length > 0 && (
            <div className="mt-4 text-xs space-y-2">
              <p className="guide-heading">Eligibility criteria evaluation</p>
              <ul className="divide-y divide-border-subtle border border-border-subtle rounded p-2 bg-surface">
                {trial.criteriaEvaluations.map((crit, cidx) => (
                  <li key={cidx} className="py-1.5 flex justify-between items-center gap-2 text-xs">
                    <div className="space-y-0.5">
                      <span className="font-medium text-foreground">{crit.name}</span>
                      {crit.evidence && <span className="text-faint text-[11px] block">{crit.evidence}</span>}
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-medium uppercase tracking-wide shrink-0 ${
                        crit.status === "met"
                          ? "bg-primary/10 text-primary"
                          : crit.status === "not-met"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-surface-muted text-faint"
                      }`}
                    >
                      {crit.status === "met" ? "Met" : crit.status === "not-met" ? "Not met" : "Unknown"}
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
                {trial.locations.slice(0, 5).map((loc, i) => (
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

          {panel && (
            <div className="mt-5 space-y-3 text-xs">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="guide-heading">Eligibility review panel</p>
                <span
                  className={`readiness-chip ${verdictChipClass(panel.consensus.verdict)}`}
                >
                  <span className="readiness-dot" aria-hidden="true" />
                  Consensus: {verdictLabel(panel.consensus.verdict)} (
                  {panel.consensus.confidence}%)
                </span>
              </div>
              {panel.consensus.conflicts.length > 0 && (
                <p className="text-faint">
                  Split opinion: {panel.consensus.conflicts.join("; ")}.
                </p>
              )}
              <ul className="space-y-3">
                {panel.reviewers.map((r) => (
                  <li
                    key={r.id}
                    className="space-y-1 border-b border-border-subtle pb-3 last:border-0"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-foreground font-medium">{r.role}</span>
                      <span className={verdictTextClass(r.verdict)}>
                        {verdictLabel(r.verdict)} ({r.confidence}%)
                      </span>
                    </div>
                    <p className="text-faint">
                      {r.focus}.{r.rationale ? ` ${r.rationale}` : ""}
                    </p>
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
                <span>Baseline condition match</span>
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
                <span>Treatment objective alignment</span>
                <span className="font-mono text-foreground font-semibold">+{bd.interestsMatch}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border-subtle/40">
                <span>Prior therapy compatibility</span>
                <span className="font-mono text-foreground font-semibold">+{bd.priorTreatmentsMatch}</span>
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
            </div>
          </div>
        )}
      </article>
    </li>
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
  const [sortBy, setSortBy] = useState<"match" | "readiness" | "phase" | "distance">("match");
  const [readinessFilter, setReadinessFilter] = useState<"all" | ReadinessStatus>("all");

  const forecasts = useMemo(() => {
    const map = new Map<string, EligibilityForecast>();
    for (const t of trials) map.set(t.trialId, forecastTrialEligibility(t, profile));
    return map;
  }, [trials, profile]);

  const forecastTotals = useMemo(
    () => summarizeForecasts(Array.from(forecasts.values())),
    [forecasts]
  );

  const countForReadiness = (key: "all" | ReadinessStatus): number => {
    switch (key) {
      case "all":
        return trials.length;
      case "likely-eligible-now":
      case "ready":
        return forecastTotals.ready;
      case "action-needed":
        return forecastTotals.actionNeeded;
      case "opens-later":
        return forecastTotals.opensLater;
      case "not-a-match":
      case "likely-ineligible":
        return forecastTotals.likelyIneligible;
      case "upcoming":
        return forecastTotals.upcoming;
    }
  };

  const visibleTrials = useMemo(() => {
    const filtered =
      readinessFilter === "all"
        ? trials
        : trials.filter((t) => forecasts.get(t.trialId)?.status === readinessFilter);

    if (sortBy === "match") return filtered;

    const rankOf = (t: MatchedTrial) =>
      READINESS_RANK[forecasts.get(t.trialId)?.status ?? "ready"];

    return [...filtered].sort((a, b) => {
      if (sortBy === "readiness")
        return rankOf(a) - rankOf(b) || b.matchScore - a.matchScore;
      if (sortBy === "phase")
        return (
          parsePhaseRank(b.phase) - parsePhaseRank(a.phase) ||
          b.matchScore - a.matchScore
        );
      if (sortBy === "distance") {
        const da = a.distance ?? Infinity;
        const db = b.distance ?? Infinity;
        return da - db || b.matchScore - a.matchScore;
      }
      return 0;
    });
  }, [trials, forecasts, readinessFilter, sortBy]);

  const handleExportAllReminders = () => {
    const events: CalendarEvent[] = [];
    for (const trial of trials) {
      const forecast = forecasts.get(trial.trialId);
      if (forecast) {
        const ev = buildReminderEvent(trial, forecast);
        if (ev) events.push(ev);
      }
    }
    if (events.length === 0) return;
    triggerDownload(
      buildIcsCalendar(events, { calendarName: "Clinical trial eligibility reminders" }),
      "trial-eligibility-reminders.ics",
      "text/calendar;charset=utf-8"
    );
  };

  const handleAddSingleReminder = (
    trial: MatchedTrial,
    forecast: EligibilityForecast
  ) => {
    const ev = buildReminderEvent(trial, forecast);
    if (!ev) return;
    triggerDownload(
      buildIcsCalendar([ev], {
        calendarName: `Eligibility reminder: ${trial.trialId}`,
      }),
      `reminder-${trial.trialId}.ics`,
      "text/calendar;charset=utf-8"
    );
  };

  useEffect(() => {
    setDisplayData(data);
  }, [data]);

  useEffect(() => {
    const whoSummary = data.registrySummaries.find(
      (s) => s.registry === "WHO ICTRP"
    );
    if (
      !whoSummary ||
      whoSummary.error !== "WHO_ICTRP_BROWSER_REQUIRED" ||
      whoSearchStartedRef.current
    ) {
      return;
    }

    whoSearchStartedRef.current = true;
    let cancelled = false;
    setWhoSearchState("loading");

    const searchCondition =
      data.queryTerms?.[0] ||
      data.profile.primaryDiagnosis ||
      "clinical trial";

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
    const headers = [
      "Title",
      "Registry",
      "TrialID",
      "Status",
      "Phase",
      "MatchScore",
      "Readiness",
      "ProjectedEligibleDate",
      "BoardStatus",
    ];
    const rows = savedTrials.map((item) => {
      const f = forecastTrialEligibility(item.trial, profile);
      return [
        item.trial.title,
        item.trial.registry,
        item.trial.trialId,
        item.trial.status,
        item.trial.phase,
        `${item.trial.matchScore}%`,
        f.label,
        f.earliestDate ?? "",
        item.boardStatus,
      ].map(escapeCsvCell);
    });
    const csvContent = [headers.map(escapeCsvCell).join(","), ...rows.map((r) => r.join(","))].join("\n");
    triggerDownload(csvContent, "clinical_trials_saved_guide.csv", "text/csv;charset=utf-8;");
  };

  const handleExportShortlistReminders = () => {
    const events: CalendarEvent[] = [];
    for (const item of savedTrials) {
      const event = buildReminderEvent(item.trial, forecastTrialEligibility(item.trial, profile));
      if (event) events.push(event);
    }
    if (events.length === 0) return;
    triggerDownload(
      buildIcsCalendar(events, { calendarName: "Shortlist eligibility reminders" }),
      "shortlist-eligibility-reminders.ics",
      "text/calendar;charset=utf-8"
    );
  };

  const totalCandidatesAcrossRegistries = displayData.registrySummaries.reduce(
    (acc, s) => acc + s.trialCount,
    0
  );
  const allRegistriesFailed = displayData.registrySummaries.every(
    (s) => s.error && s.error !== "WHO_ICTRP_BROWSER_REQUIRED"
  );

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
        <aside className="lg:col-span-4 results-sidebar space-y-6 order-1">
          <ProfileSummary profile={profile} onUpdate={onProfileUpdate} />
          <RegistryStatus
            summaries={displayData.registrySummaries}
            whoSearchState={whoSearchState}
          />
        </aside>

        <div className="lg:col-span-8 order-2 min-w-0">
          {activeTab === "results" ? (
            <div
              className={`transition-opacity duration-200 ${
                isUpdating ? "opacity-50 pointer-events-none" : "opacity-100"
              }`}
            >
              {trials.length === 0 ? (
                <div className="py-16 text-center space-y-3">
                  <p className="font-display text-2xl text-foreground">
                    {allRegistriesFailed
                      ? "Search failed across registries"
                      : totalCandidatesAcrossRegistries > 0
                      ? "No trials appear to match the available patient information"
                      : "No studies found"}
                  </p>
                  <p className="section-hint max-w-md mx-auto font-body text-sm">
                    {allRegistriesFailed
                      ? "The public registry servers could not be reached. Please check your connection and try again."
                      : totalCandidatesAcrossRegistries > 0
                      ? `${totalCandidatesAcrossRegistries} candidate studies were identified in public registries, but none met the minimum estimated eligibility fit for this clinical profile.`
                      : "No clinical studies were returned for this condition. Consider broadening the diagnosis or search criteria."}
                  </p>
                </div>
              ) : (
                <section aria-labelledby="trials-heading">
                  <h2 id="trials-heading" className="sr-only">
                    Matching clinical trials
                  </h2>

                  <div className="forecast-panel mb-6">
                    <div className="min-w-0">
                      <h3 className="font-display text-lg text-foreground">
                        Trial readiness forecast
                      </h3>
                      <p className="section-hint text-sm font-body mt-1 leading-relaxed">
                        Forward-looking eligibility assessment based on public criteria.
                        {forecastTotals.nextDate && (
                          <>
                            {" "}
                            Next projected window:{" "}
                            <span className="text-foreground font-medium">
                              {formatForecastDate(forecastTotals.nextDate)}
                            </span>
                            .
                          </>
                        )}
                      </p>
                    </div>
                    {forecastTotals.upcoming > 0 && (
                      <button
                        type="button"
                        onClick={handleExportAllReminders}
                        className="btn-secondary text-sm whitespace-nowrap shrink-0"
                      >
                        Add {forecastTotals.upcoming} reminder
                        {forecastTotals.upcoming === 1 ? "" : "s"} (.ics)
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                    <div
                      className="flex flex-wrap gap-1.5"
                      role="group"
                      aria-label="Filter by readiness"
                    >
                      {READINESS_FILTERS.map((f) => {
                        const n = countForReadiness(f.key);
                        if (f.key !== "all" && n === 0) return null;
                        return (
                          <button
                            key={f.key}
                            type="button"
                            onClick={() => setReadinessFilter(f.key)}
                            className={`chip-filter ${
                              readinessFilter === f.key ? "chip-filter-active" : ""
                            }`}
                            aria-pressed={readinessFilter === f.key}
                          >
                            {f.label} <span className="chip-count">{n}</span>
                          </button>
                        );
                      })}
                    </div>
                    <label className="flex items-center gap-2 text-xs text-faint font-body shrink-0">
                      Sort
                      <select
                        value={sortBy}
                        onChange={(e) =>
                          setSortBy(e.target.value as typeof sortBy)
                        }
                        className="field-select text-xs w-auto"
                      >
                        <option value="match">Best match</option>
                        <option value="readiness">Readiness</option>
                        <option value="phase">Phase</option>
                        <option value="distance">Nearest</option>
                      </select>
                    </label>
                  </div>

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

                  {visibleTrials.length > 0 ? (
                    <ol className="space-y-5" aria-label="Matching clinical trials">
                      {visibleTrials.map((trial, index) => (
                        <TrialCard
                          key={`${trial.registry}-${trial.trialId}`}
                          trial={trial}
                          profile={profile}
                          forecast={
                            forecasts.get(trial.trialId) ??
                            forecastTrialEligibility(trial, profile)
                          }
                          index={index}
                          isSaved={Boolean(savedTrials.find((t) => t.trial.trialId === trial.trialId))}
                          onSaveToggle={() => handleSaveToggle(trial)}
                          onAddReminder={handleAddSingleReminder}
                        />
                      ))}
                    </ol>
                  ) : (
                    <div className="py-12 text-center text-faint text-sm font-body">
                      No trials match the selected readiness filter ({readinessFilter}).
                    </div>
                  )}
                </section>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="font-display text-lg text-foreground">Trial shortlist</h3>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleExportCSV}
                    disabled={savedTrials.length === 0}
                    className="btn-ghost text-xs disabled:opacity-40"
                  >
                    Export CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowGuideModal(true)}
                    disabled={savedTrials.length === 0}
                    className="btn-primary text-xs min-h-9 px-4 disabled:opacity-40"
                  >
                    Consultation guide
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {columns.map((col) => {
                  const items = savedTrials.filter((t) => t.boardStatus === col);
                  return (
                    <div key={col} className="bg-surface-muted p-3 rounded border border-border-subtle flex flex-col min-h-[300px]">
                      <div className="flex justify-between items-center mb-3">
                        <span className="font-semibold text-xs text-foreground font-body">{colLabels[col]}</span>
                        <span className="text-xs text-faint bg-surface px-1.5 py-0.5 rounded border border-border-subtle font-mono">
                          {items.length}
                        </span>
                      </div>
                      <ul className="space-y-2.5 flex-1">
                        {items.map((item) => (
                          <li key={item.trial.trialId} className="p-2.5 bg-surface rounded border border-border text-xs space-y-1.5 shadow-sm font-body">
                            <span className="font-semibold text-foreground line-clamp-2 block leading-snug">
                              {item.trial.title}
                            </span>
                            <span className="text-faint text-[10px] block font-mono">
                              {item.trial.registry} &bull; {item.trial.trialId}
                            </span>

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
                          <li className="py-8 text-faint text-xs italic font-body text-center">
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
                <h3 className="font-display text-xl text-foreground">Clinical consultation guide</h3>
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
                  onClick={handleExportShortlistReminders}
                  className="btn-ghost text-xs"
                >
                  Calendar reminders
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
              <h2 className="text-2xl font-bold text-foreground">Clinical Trial Matcher: Discussion Guide</h2>
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
                  <span className="block text-xs font-semibold text-faint">Subtype / Stage</span>
                  <span className="font-medium text-foreground">{profile.subtype ?? profile.stage ?? "Not specified"}</span>
                </div>
                <div>
                  <span className="block text-xs font-semibold text-faint">Current Therapy</span>
                  <span className="font-medium text-foreground">{profile.currentTreatment ?? "None specified"}</span>
                </div>
                <div>
                  <span className="block text-xs font-semibold text-faint">Prior Treatments</span>
                  <span className="font-medium text-foreground">{profile.priorTreatments.length > 0 ? profile.priorTreatments.join(", ") : "None specified"}</span>
                </div>
                <div>
                  <span className="block text-xs font-semibold text-faint">Location</span>
                  <span className="font-medium text-foreground">{formatLocationDisplay(profile.location) ?? "Not specified"}</span>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h4 className="font-display text-base font-bold text-foreground border-b border-border-subtle pb-1.5">Shortlisted studies for discussion</h4>
              
              <ul className="space-y-6">
                {savedTrials.map((item) => {
                  const questions = generatePersonalizedQuestions(profile, item.trial);
                  const forecast = forecastTrialEligibility(item.trial, profile);
                  return (
                    <li key={item.trial.trialId} className="py-5 border-b border-border-subtle space-y-3 page-break-avoid font-body last:border-0">
                      <div className="flex justify-between items-baseline flex-wrap gap-2">
                        <span className="font-display text-sm text-foreground">{item.trial.title}</span>
                        <span className="text-xs text-faint">{item.trial.registry}, {item.trial.trialId} ({item.trial.phase})</span>
                      </div>
                      <p className="text-xs text-faint italic mt-1 font-body line-clamp-3">
                        {truncateTrialSummary(item.trial.summary)}
                      </p>

                      <p className="text-xs mt-1 font-body">
                        <span className="font-medium text-foreground">Readiness: </span>
                        {forecast.label}
                        {forecast.earliestDate
                          ? ` (projected ${formatForecastDate(forecast.earliestDate)})`
                          : ""}
                        .
                        {forecast.blockers.length > 0
                          ? ` Blockers: ${forecast.blockers.join("; ")}.`
                          : ""}
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

            <div className="pt-6 border-t border-border-subtle text-xs text-faint leading-relaxed font-body">
              <p>
                <strong>Disclaimer:</strong> For informational purposes only. This tool does not provide medical advice, diagnosis, or treatment recommendations and cannot enroll patients in studies. Eligibility estimates are based on publicly available trial criteria and the information provided. Confirm eligibility directly with the study team or an appropriate healthcare professional.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
