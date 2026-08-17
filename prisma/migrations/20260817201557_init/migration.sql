-- CreateEnum
CREATE TYPE "CoderKind" AS ENUM ('HUMAN', 'AI');

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "steamAppId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "steamReviewId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "votedUp" BOOLEAN NOT NULL,
    "playtimeForever" INTEGER NOT NULL,
    "votesUp" INTEGER NOT NULL,
    "votesFunny" INTEGER NOT NULL,
    "weightedVoteScore" DOUBLE PRECISION NOT NULL,
    "timestampCreated" TIMESTAMP(3) NOT NULL,
    "timestampUpdated" TIMESTAMP(3) NOT NULL,
    "writtenDuringEarlyAccess" BOOLEAN NOT NULL,
    "steamPurchase" BOOLEAN NOT NULL,
    "receivedForFree" BOOLEAN NOT NULL,
    "commentCount" INTEGER NOT NULL,
    "language" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coder" (
    "id" TEXT NOT NULL,
    "kind" "CoderKind" NOT NULL DEFAULT 'HUMAN',
    "name" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Coder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Codebook" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Codebook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Code" (
    "id" TEXT NOT NULL,
    "codebookId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6b7280',
    "parentCodeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tagging" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "codeId" TEXT NOT NULL,
    "coderId" TEXT NOT NULL,
    "spanStart" INTEGER,
    "spanEnd" INTEGER,
    "memo" TEXT,
    "aiConfidence" DOUBLE PRECISION,
    "aiRationale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tagging_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Game_steamAppId_key" ON "Game"("steamAppId");

-- CreateIndex
CREATE UNIQUE INDEX "Review_steamReviewId_key" ON "Review"("steamReviewId");

-- CreateIndex
CREATE INDEX "Review_gameId_idx" ON "Review"("gameId");

-- CreateIndex
CREATE INDEX "Review_gameId_votedUp_idx" ON "Review"("gameId", "votedUp");

-- CreateIndex
CREATE INDEX "Review_gameId_timestampCreated_idx" ON "Review"("gameId", "timestampCreated");

-- CreateIndex
CREATE UNIQUE INDEX "Coder_email_key" ON "Coder"("email");

-- CreateIndex
CREATE INDEX "Codebook_gameId_idx" ON "Codebook"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "Code_codebookId_label_key" ON "Code"("codebookId", "label");

-- CreateIndex
CREATE INDEX "Tagging_reviewId_idx" ON "Tagging"("reviewId");

-- CreateIndex
CREATE INDEX "Tagging_codeId_idx" ON "Tagging"("codeId");

-- CreateIndex
CREATE INDEX "Tagging_coderId_idx" ON "Tagging"("coderId");

-- CreateIndex
CREATE INDEX "Event_gameId_idx" ON "Event"("gameId");

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Codebook" ADD CONSTRAINT "Codebook_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Code" ADD CONSTRAINT "Code_codebookId_fkey" FOREIGN KEY ("codebookId") REFERENCES "Codebook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Code" ADD CONSTRAINT "Code_parentCodeId_fkey" FOREIGN KEY ("parentCodeId") REFERENCES "Code"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tagging" ADD CONSTRAINT "Tagging_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tagging" ADD CONSTRAINT "Tagging_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "Code"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tagging" ADD CONSTRAINT "Tagging_coderId_fkey" FOREIGN KEY ("coderId") REFERENCES "Coder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
