import Link from "next/link";
import type { MatchResponse, PatientProfile } from "@/lib/types";

interface ResultsDashboardProps {
  data: MatchResponse;
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

function formatLocation(profile: PatientProfile): string | null {
  if (!profile.location) return null;
  const parts = [
    profile.location.city,
    profile.location.state,
    profile.location.country,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function formatSex(sex: PatientProfile["sex"]): string | null {
  if (sex === "unknown") return null;
  return sex.charAt(0).toUpperCase() + sex.slice(1);
}

function ProfileSummary({ profile }: { profile: PatientProfile }) {
  const rows: Array<{ label: string; value: string | number | null }> = [
    { label: "Age", value: profile.age },
    { label: "Sex", value: formatSex(profile.sex) },
    { label: "Diagnosis", value: profile.primaryDiagnosis },
    { label: "Stage", value: profile.stage },
    { label: "Location", value: formatLocation(profile) },
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
  ];

  return (
    <section aria-labelledby="profile-heading">
      <h2
        id="profile-heading"
        className="font-display text-xl text-foreground text-pretty"
      >
        What we understood
      </h2>
      <p className="section-hint mt-1 mb-5">
        Please confirm these details look right before you review any trials.
      </p>

      <dl>
        {rows.map((row) => (
          <div key={row.label} className="profile-row">
            <dt className="profile-label">{row.label}</dt>
            <dd className="profile-value">
              {row.value ?? (
                <span className="text-faint italic">Not mentioned in notes</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
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
            <span className="section-hint text-sm">
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
        <p className="section-hint text-xs mt-4 pt-4 border-t border-border-subtle">
          Some registries were unavailable, but results below include trials from
          the sources that responded.
        </p>
      )}
    </section>
  );
}

export default function ResultsDashboard({ data }: ResultsDashboardProps) {
  const { profile, trials } = data;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <p className="section-label text-primary">Your results</p>
          <h2 className="font-display text-2xl sm:text-3xl text-foreground mt-1 text-pretty">
            {trials.length === 0
              ? "No open trials found"
              : trials.length === 1
                ? "1 trial may be a fit"
                : `${trials.length} trials may be a fit`}
          </h2>
          <p className="section-hint mt-2 max-w-md">
            {trials.length === 0
              ? "Try adding more detail about diagnosis, biomarkers, or location."
              : "Ranked by how closely each study matches the notes you shared. Phase II and later studies are listed first."}
          </p>
        </div>
        <Link href="/" className="btn-secondary self-start shrink-0">
          New search
        </Link>
      </div>

      <RegistryStatus summaries={data.registrySummaries} />

      <div className="chart-panel">
        <ProfileSummary profile={profile} />
      </div>

      {trials.length === 0 ? (
        <div className="info-card text-center py-10">
          <p className="font-display text-lg text-foreground">
            Nothing matched this time
          </p>
          <p className="section-hint mt-2 max-w-sm mx-auto">
            That does not mean no trials exist. A care team can search manually
            or broaden the criteria.
          </p>
          <Link href="/" className="btn-primary mt-6">
            Try a different search
          </Link>
        </div>
      ) : (
        <section aria-labelledby="trials-heading">
          <h2 id="trials-heading" className="sr-only">
            Matching clinical trials
          </h2>

          <ol className="space-y-5" aria-label="Matching clinical trials">
            {trials.map((trial, index) => (
              <li
                key={`${trial.registry}-${trial.trialId}`}
                className="trial-card trial-enter"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <article aria-labelledby={`trial-title-${trial.trialId}`}>
                  <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="registry-chip">{trial.registry}</span>
                        <span className="status-pill-open">{trial.status}</span>
                        {trial.phase !== "Not specified" && (
                          <span className="section-hint text-xs">
                            {trial.phase}
                          </span>
                        )}
                      </div>

                      <h3
                        id={`trial-title-${trial.trialId}`}
                        className="font-display text-lg sm:text-xl text-foreground leading-snug text-pretty"
                      >
                        {trial.title}
                      </h3>

                      <p className="section-hint mt-3 leading-relaxed break-words">
                        {trial.summary}
                        {trial.summary.length >= 400 && "…"}
                      </p>

                      {trial.locations.length > 0 && (
                        <div className="mt-4">
                          <p className="section-label text-xs mb-1.5">
                            Study locations
                          </p>
                          <ul className="space-y-1">
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

                    <div className="shrink-0 flex sm:flex-col items-center sm:items-end gap-3 sm:gap-2">
                      <div
                        className={matchBadgeClass(trial.matchScore)}
                        aria-label={`${trial.matchScore} percent match, ${matchLabel(trial.matchScore).toLowerCase()}`}
                      >
                        <span className="match-score-num">
                          {trial.matchScore}%
                        </span>
                        <span className="match-score-label">
                          {matchLabel(trial.matchScore)}
                        </span>
                      </div>

                      <a
                        href={safeUrl(trial.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-secondary text-sm whitespace-nowrap"
                      >
                        View full details
                      </a>
                    </div>
                  </div>
                </article>
              </li>
            ))}
          </ol>

          <p className="section-hint text-center mt-8 text-xs max-w-md mx-auto">
            Match scores are estimates based on your notes. A doctor or research
            coordinator should confirm eligibility before enrolling.
          </p>
        </section>
      )}
    </div>
  );
}
