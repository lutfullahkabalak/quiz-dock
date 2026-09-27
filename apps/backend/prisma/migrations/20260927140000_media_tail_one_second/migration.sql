-- A new quiz keeps one second after a media before its time can run out (was 3).
-- Existing quizzes keep the pause they have.
ALTER TABLE "quiz" ALTER COLUMN "media_tail_s" SET DEFAULT 1;
