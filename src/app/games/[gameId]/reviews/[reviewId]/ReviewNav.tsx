import Link from "next/link";

export function ReviewNav({
  gameId,
  query,
  position,
  total,
  prevId,
  nextId,
}: {
  gameId: string;
  query: string;
  position: number;
  total: number;
  prevId: string | undefined;
  nextId: string | undefined;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      {prevId ? (
        <Link href={`/games/${gameId}/reviews/${prevId}?${query}`} className="underline">
          ← Previous review
        </Link>
      ) : (
        <span className="text-gray-300">← Previous review</span>
      )}
      <span className="text-gray-500">
        Review {position} of {total}
      </span>
      {nextId ? (
        <Link href={`/games/${gameId}/reviews/${nextId}?${query}`} className="underline">
          Next review →
        </Link>
      ) : (
        <span className="text-gray-300">Next review →</span>
      )}
    </div>
  );
}
