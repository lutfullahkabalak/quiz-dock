-- A question may last up to 240 s, as in Kahoot (RG-03).
ALTER TABLE "question" DROP CONSTRAINT "question_time_limit_s_check";
ALTER TABLE "question" ADD CONSTRAINT "question_time_limit_s_check" CHECK ("time_limit_s" BETWEEN 5 AND 240);
