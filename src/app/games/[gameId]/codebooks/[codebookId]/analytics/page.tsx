import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { cohensKappa, interpretKappa } from "@/lib/kappa";

function monthKey(d: Date) {
  return d.toISOString().slice(0, 7); // YYYY-MM
}

export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ gameId: string; codebookId: string }>;
}) {
  const { gameId, codebookId } = await params;

  const codebook = await prisma.codebook.findUnique({
    where: { id: codebookId },
    include: { game: true },
  });
  if (!codebook || codebook.gameId !== gameId) notFound();

  const codes = await prisma.code.findMany({
    where: { codebookId },
    orderBy: { createdAt: "asc" },
  });

  const taggings = await prisma.tagging.findMany({
    where: { codeId: { in: codes.map((c) => c.id) } },
    include: {
      coder: true,
      review: { select: { id: true, timestampCreated: true } },
    },
  });

  const events = await prisma.event.findMany({
    where: { gameId },
    orderBy: { date: "asc" },
  });

  // --- Reliability (Cohen's kappa) ---
  // Scope to reviews the human coder actually examined (tagged at least
  // once) — comparing AI suggestions against untouched reviews wouldn't
  // measure agreement, just AI activity.
  const humanReviewIds = [
    ...new Set(
      taggings.filter((t) => t.coder.kind === "HUMAN").map((t) => t.reviewId),
    ),
  ];

  const pairs = humanReviewIds.flatMap((reviewId) =>
    codes.map((code) => ({
      humanPresent: taggings.some(
        (t) => t.reviewId === reviewId && t.codeId === code.id && t.coder.kind === "HUMAN",
      ),
      aiPresent: taggings.some(
        (t) => t.reviewId === reviewId && t.codeId === code.id && t.coder.kind === "AI",
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
        human: codeTaggings.filter((t) => t.coder.kind === "HUMAN").length,
        ai: codeTaggings.filter((t) => t.coder.kind === "AI").length,
      };
    })
    .sort((a, b) => b.total - a.total);
  const maxFrequency = Math.max(...frequency.map((f) => f.total), 1);

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
    const month = monthKey(t.review.timestampCreated);
    monthsSet.add(month);
    if (!seriesByCode.has(t.codeId)) seriesByCode.set(t.codeId, new Map());
    const m = seriesByCode.get(t.codeId)!;
    m.set(month, (m.get(month) ?? 0) + 1);
  }
  const months = [...monthsSet].sort();

  return (
    <main className="mx-auto max-w-3xl p-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{codebook.game.name}</p>
          <h1 className="text-2xl font-semibold">{codebook.name} — Analytics</h1>
        </div>
        <Link href={`/games/${gameId}/codebooks/${codebookId}`} className="text-sm underline">
          ← Codebook
        </Link>
      </div>

      {/* Reliability */}
      <section className="mt-6 rounded border border-gray-200 p-4">
        <h2 className="font-medium">AI–human reliability (Cohen&apos;s κ)</h2>
        {reliability.totalPairs === 0 ? (
          <p className="mt-2 text-sm text-gray-500">
            No reviews have been coded by the human researcher yet — reliability
            has nothing to compare against.
          </p>
        ) : (
          <>
            <p className="mt-2 text-3xl font-semibold">
              {reliability.kappa === null ? "—" : reliability.kappa.toFixed(3)}
            </p>
            {reliability.kappa !== null && (
              <p className="text-sm text-gray-500">{interpretKappa(reliability.kappa)} agreement</p>
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
      <section className="mt-6 rounded border border-gray-200 p-4">
        <h2 className="font-medium">Code frequency</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {frequency.map((f) => (
            <li key={f.code.id} className="text-sm">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: f.code.color }}
                  />
                  {f.code.label}
                </span>
                <span className="text-gray-500">
                  {f.total} ({f.human} human, {f.ai} AI)
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded bg-gray-100">
                <div
                  className="h-1.5 rounded"
                  style={{
                    width: `${(f.total / maxFrequency) * 100}%`,
                    backgroundColor: f.code.color,
                  }}
                />
              </div>
            </li>
          ))}
          {frequency.length === 0 && (
            <li className="text-sm text-gray-500">No taggings yet.</li>
          )}
        </ul>
      </section>

      {/* Co-occurrence */}
      <section className="mt-6 rounded border border-gray-200 p-4">
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
      <section className="mt-6 rounded border border-gray-200 p-4">
        <h2 className="font-medium">Theme frequency over time</h2>
        {months.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">Not enough dated taggings yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-max text-xs">
              <thead>
                <tr>
                  <th className="pr-3 text-left font-medium">Code</th>
                  {months.map((m) => (
                    <th key={m} className="px-2 text-right font-medium">
                      {m}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {codes.map((code) => {
                  const series = seriesByCode.get(code.id);
                  return (
                    <tr key={code.id} className="border-t border-gray-100">
                      <td className="py-1 pr-3">{code.label}</td>
                      {months.map((m) => (
                        <td key={m} className="px-2 py-1 text-right text-gray-600">
                          {series?.get(m) ?? 0}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
                  {e.date.toISOString().slice(0, 10)} — {e.label}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}
