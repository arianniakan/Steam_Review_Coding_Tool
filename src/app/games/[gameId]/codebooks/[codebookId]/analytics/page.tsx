"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { cohensKappa, interpretKappa } from "@/lib/kappa";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { BackButton } from "@/components/BackButton";
import { KappaGauge } from "./KappaGauge";
import { CodeFrequencyChart } from "./CodeFrequencyChart";
import { ThemeTimelineChart } from "./ThemeTimelineChart";
import { getGameById, type Game } from "@/lib/localDb/queries/games";
import { getCodebookById, type Codebook } from "@/lib/localDb/queries/codebooks";
import { listCodesForCodebook, type Code } from "@/lib/localDb/queries/codes";
import { listTaggingsForCodebookAnalytics, type TaggingForAnalytics } from "@/lib/localDb/queries/taggings";
import { listEventsForGame, type Event } from "@/lib/localDb/queries/events";

function monthKey(d: string | Date) {
  return new Date(d).toISOString().slice(0, 7); // YYYY-MM
}

export default function AnalyticsPage() {
  const { gameId, codebookId } = useParams<{ gameId: string; codebookId: string }>();
  const [loading, setLoading] = useState(true);
  const [game, setGame] = useState<Game | null>(null);
  const [codebook, setCodebook] = useState<Codebook | null>(null);
  const [codes, setCodes] = useState<Code[]>([]);
  const [taggings, setTaggings] = useState<TaggingForAnalytics[]>([]);
  const [events, setEvents] = useState<Event[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cb = await getCodebookById(codebookId);
      if (cancelled) return;
      if (!cb || cb.gameId !== gameId) {
        setCodebook(null);
        setLoading(false);
        return;
      }
      const [g, cds, tgs, evs] = await Promise.all([
        getGameById(gameId),
        listCodesForCodebook(codebookId),
        listTaggingsForCodebookAnalytics(codebookId),
        listEventsForGame(gameId),
      ]);
      if (cancelled) return;
      setGame(g);
      setCodebook(cb);
      setCodes(cds);
      setTaggings(tgs);
      setEvents(evs);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [gameId, codebookId]);

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <p className="text-sm text-gray-500">Loading…</p>
      </main>
    );
  }

  if (!codebook || !game) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <p className="text-sm text-gray-500">Codebook not found.</p>
      </main>
    );
  }

  // --- Reliability (Cohen's kappa) ---
  const humanReviewIds = [
    ...new Set(taggings.filter((t) => t.coderKind === "HUMAN").map((t) => t.reviewId)),
  ];

  const pairs = humanReviewIds.flatMap((reviewId) =>
    codes.map((code) => ({
      humanPresent: taggings.some(
        (t) => t.reviewId === reviewId && t.codeId === code.id && t.coderKind === "HUMAN",
      ),
      aiPresent: taggings.some(
        (t) => t.reviewId === reviewId && t.codeId === code.id && t.coderKind === "AI",
      ),
    })),
  );
  const reliability = cohensKappa(pairs);

  // --- Code frequency ---
  const frequency = codes
    .map((code) => {
      const codeTaggings = taggings.filter((t) => t.codeId === code.id);
      return {
        code,
        total: codeTaggings.length,
        human: codeTaggings.filter((t) => t.coderKind === "HUMAN").length,
        ai: codeTaggings.filter((t) => t.coderKind === "AI").length,
      };
    })
    .sort((a, b) => b.total - a.total);

  // --- Code co-occurrence (top pairs within the same review, any coder) ---
  const codesByReview = new Map<string, Set<string>>();
  for (const t of taggings) {
    if (!codesByReview.has(t.reviewId)) codesByReview.set(t.reviewId, new Set());
    codesByReview.get(t.reviewId)!.add(t.codeId);
  }
  const coocCounts = new Map<string, number>();
  for (const codeSet of codesByReview.values()) {
    const ids = [...codeSet];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = [ids[i], ids[j]].sort().join("|");
        coocCounts.set(key, (coocCounts.get(key) ?? 0) + 1);
      }
    }
  }
  const codeById = new Map(codes.map((c) => [c.id, c]));
  const coocList = [...coocCounts.entries()]
    .map(([key, count]) => {
      const [a, b] = key.split("|");
      return { a: codeById.get(a)!, b: codeById.get(b)!, count };
    })
    .sort((x, y) => y.count - x.count)
    .slice(0, 10);

  // --- Theme frequency over time (per code, per month) ---
  const monthsSet = new Set<string>();
  const seriesByCode = new Map<string, Map<string, number>>();
  for (const t of taggings) {
    const month = monthKey(t.reviewTimestampCreated);
    monthsSet.add(month);
    if (!seriesByCode.has(t.codeId)) seriesByCode.set(t.codeId, new Map());
    const m = seriesByCode.get(t.codeId)!;
    m.set(month, (m.get(month) ?? 0) + 1);
  }
  const months = [...monthsSet].sort();

  return (
    <main className="mx-auto max-w-3xl p-8">
      <Breadcrumbs
        items={[
          { label: "Games", href: "/games" },
          { label: game.name, href: `/games/${gameId}/reviews` },
          { label: "Codebooks", href: `/games/${gameId}/codebooks` },
          { label: codebook.name, href: `/games/${gameId}/codebooks/${codebookId}` },
          { label: "Analytics" },
        ]}
      />
      <div className="mt-2">
        <BackButton href={`/games/${gameId}/codebooks/${codebookId}`} label={codebook.name} />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{game.name}</p>
          <h1 className="text-2xl font-semibold">{codebook.name} — Analytics</h1>
        </div>
      </div>

      {/* Reliability */}
      <section className="mt-6 rounded-xl border border-gray-200 bg-white shadow-sm p-4">
        <h2 className="font-medium">AI–human reliability (Cohen&apos;s κ)</h2>
        {reliability.totalPairs === 0 ? (
          <p className="mt-2 text-sm text-gray-500">
            No reviews have been coded by the human researcher yet — reliability
            has nothing to compare against.
          </p>
        ) : (
          <>
            {reliability.kappa === null ? (
              <p className="mt-2 text-3xl font-semibold">—</p>
            ) : (
              <div className="mt-2 flex justify-center">
                <KappaGauge kappa={reliability.kappa} interpretation={interpretKappa(reliability.kappa)} />
              </div>
            )}
            <table className="mt-4 w-full text-sm">
              <tbody>
                <tr className="border-t border-gray-100">
                  <td className="py-1 text-gray-500">Both applied</td>
                  <td className="py-1 text-right">{reliability.bothPresent}</td>
                </tr>
                <tr className="border-t border-gray-100">
                  <td className="py-1 text-gray-500">Human only</td>
                  <td className="py-1 text-right">{reliability.humanOnly}</td>
                </tr>
                <tr className="border-t border-gray-100">
                  <td className="py-1 text-gray-500">AI only</td>
                  <td className="py-1 text-right">{reliability.aiOnly}</td>
                </tr>
                <tr className="border-t border-gray-100">
                  <td className="py-1 text-gray-500">Neither applied</td>
                  <td className="py-1 text-right">{reliability.neitherPresent}</td>
                </tr>
                <tr className="border-t border-gray-200 font-medium">
                  <td className="py-1">(review, code) judgments</td>
                  <td className="py-1 text-right">{reliability.totalPairs}</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-2 text-xs text-gray-500">
              Scored over the {humanReviewIds.length} review(s) the human researcher
              has coded × {codes.length} code(s) in this codebook.
            </p>
          </>
        )}
      </section>

      {/* Code frequency */}
      <section className="mt-6 rounded-xl border border-gray-200 bg-white shadow-sm p-4">
        <h2 className="font-medium">Code frequency</h2>
        {frequency.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">No taggings yet.</p>
        ) : (
          <div className="mt-3">
            <CodeFrequencyChart
              data={frequency.map((f) => ({ label: f.code.label, human: f.human, ai: f.ai }))}
            />
          </div>
        )}
      </section>

      {/* Co-occurrence */}
      <section className="mt-6 rounded-xl border border-gray-200 bg-white shadow-sm p-4">
        <h2 className="font-medium">Code co-occurrence (top pairs, same review)</h2>
        <ul className="mt-3 flex flex-col gap-1 text-sm">
          {coocList.map(({ a, b, count }) => (
            <li key={`${a.id}-${b.id}`} className="flex items-center justify-between">
              <span>
                {a.label} + {b.label}
              </span>
              <span className="text-gray-500">{count}</span>
            </li>
          ))}
          {coocList.length === 0 && (
            <li className="text-gray-500">
              No two codes have appeared together on the same review yet.
            </li>
          )}
        </ul>
      </section>

      {/* Theme frequency over time */}
      <section className="mt-6 rounded-xl border border-gray-200 bg-white shadow-sm p-4">
        <h2 className="font-medium">Theme frequency over time</h2>
        {months.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">Not enough dated taggings yet.</p>
        ) : (
          <div className="mt-3">
            <ThemeTimelineChart
              months={months}
              series={codes.map((code) => ({
                code: { id: code.id, label: code.label, color: code.color },
                data: months.map((m) => seriesByCode.get(code.id)?.get(m) ?? 0),
              }))}
            />
          </div>
        )}

        {events.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium text-gray-500">
              Events in this window (patches, controversies, etc.)
            </p>
            <ul className="mt-1 text-xs text-gray-500">
              {events.map((e) => (
                <li key={e.id}>
                  {new Date(e.date).toISOString().slice(0, 10)} — {e.label}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}
