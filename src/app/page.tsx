import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-semibold">
        Steam Reviews Qualitative Coding Tool
      </h1>
      <p className="mt-2 text-sm text-gray-500">
        Ingest Steam reviews, build a codebook, tag review segments, and get
        AI-assisted coding suggestions with measured human-AI agreement.
      </p>
      <div className="mt-6 flex flex-col gap-2">
        <Link href="/ingest" className="underline">
          Ingest reviews for a game →
        </Link>
      </div>
    </main>
  );
}
