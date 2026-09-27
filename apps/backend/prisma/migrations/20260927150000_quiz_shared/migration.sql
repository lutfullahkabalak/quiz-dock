-- A quiz its owner shares with the instance's other hosts: they list it and read it,
-- and copy it to make it theirs. Private by default.
ALTER TABLE "quiz" ADD COLUMN "shared" BOOLEAN NOT NULL DEFAULT false;
