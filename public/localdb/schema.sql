-- Mirrors prisma/schema.prisma exactly (see that file for the canonical
-- source-of-truth model definitions and comments on each field's purpose).
-- Applied once, client-side, against a fresh PGlite instance.

DO $$ BEGIN
  CREATE TYPE "CoderKind" AS ENUM ('HUMAN', 'AI');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Game" (
  "id" TEXT PRIMARY KEY,
  "steamAppId" INTEGER NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "headerImage" TEXT,
  "shortDescription" TEXT,
  "genres" TEXT[] NOT NULL DEFAULT '{}',
  "releaseDate" TEXT,
  "developers" TEXT[] NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS "SavedSample" (
  "id" TEXT PRIMARY KEY,
  "gameId" TEXT NOT NULL REFERENCES "Game"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "query" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SavedSample_gameId_idx" ON "SavedSample"("gameId");

CREATE TABLE IF NOT EXISTS "Review" (
  "id" TEXT PRIMARY KEY,
  "gameId" TEXT NOT NULL REFERENCES "Game"("id") ON DELETE CASCADE,
  "steamReviewId" TEXT NOT NULL UNIQUE,
  "text" TEXT NOT NULL,
  "votedUp" BOOLEAN NOT NULL,
  "playtimeForever" INTEGER NOT NULL,
  "votesUp" INTEGER NOT NULL,
  "votesFunny" INTEGER NOT NULL,
  "weightedVoteScore" DOUBLE PRECISION NOT NULL,
  "timestampCreated" TIMESTAMPTZ NOT NULL,
  "timestampUpdated" TIMESTAMPTZ NOT NULL,
  "writtenDuringEarlyAccess" BOOLEAN NOT NULL,
  "steamPurchase" BOOLEAN NOT NULL,
  "receivedForFree" BOOLEAN NOT NULL,
  "commentCount" INTEGER NOT NULL,
  "language" TEXT NOT NULL,
  "textLength" INTEGER NOT NULL DEFAULT 0,
  "playtimeAtReview" INTEGER,
  "playtimeLastTwoWeeks" INTEGER,
  "authorNumGamesOwned" INTEGER,
  "authorNumReviews" INTEGER,
  "authorLastPlayed" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "Review_gameId_idx" ON "Review"("gameId");
CREATE INDEX IF NOT EXISTS "Review_gameId_votedUp_idx" ON "Review"("gameId", "votedUp");
CREATE INDEX IF NOT EXISTS "Review_gameId_timestampCreated_idx" ON "Review"("gameId", "timestampCreated");

CREATE TABLE IF NOT EXISTS "Coder" (
  "id" TEXT PRIMARY KEY,
  "kind" "CoderKind" NOT NULL DEFAULT 'HUMAN',
  "name" TEXT NOT NULL,
  "email" TEXT UNIQUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Codebook" (
  "id" TEXT PRIMARY KEY,
  "gameId" TEXT NOT NULL REFERENCES "Game"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "Codebook_gameId_idx" ON "Codebook"("gameId");

CREATE TABLE IF NOT EXISTS "Code" (
  "id" TEXT PRIMARY KEY,
  "codebookId" TEXT NOT NULL REFERENCES "Codebook"("id") ON DELETE CASCADE,
  "label" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "color" TEXT NOT NULL DEFAULT '#6b7280',
  "parentCodeId" TEXT REFERENCES "Code"("id") ON DELETE SET NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("codebookId", "label")
);

CREATE TABLE IF NOT EXISTS "Tagging" (
  "id" TEXT PRIMARY KEY,
  "reviewId" TEXT NOT NULL REFERENCES "Review"("id") ON DELETE CASCADE,
  "codeId" TEXT NOT NULL REFERENCES "Code"("id") ON DELETE CASCADE,
  "coderId" TEXT NOT NULL REFERENCES "Coder"("id") ON DELETE CASCADE,
  "spanStart" INTEGER,
  "spanEnd" INTEGER,
  "memo" TEXT,
  "aiConfidence" DOUBLE PRECISION,
  "aiRationale" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "Tagging_reviewId_idx" ON "Tagging"("reviewId");
CREATE INDEX IF NOT EXISTS "Tagging_codeId_idx" ON "Tagging"("codeId");
CREATE INDEX IF NOT EXISTS "Tagging_coderId_idx" ON "Tagging"("coderId");

CREATE TABLE IF NOT EXISTS "Event" (
  "id" TEXT PRIMARY KEY,
  "gameId" TEXT NOT NULL REFERENCES "Game"("id") ON DELETE CASCADE,
  "label" TEXT NOT NULL,
  "date" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "Event_gameId_idx" ON "Event"("gameId");
