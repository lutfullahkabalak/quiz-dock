-- Image choice: answers that are pictures, one or several right.
ALTER TYPE "question_type" ADD VALUE 'image_choice';
ALTER TABLE "question" ADD COLUMN "multi_select" BOOLEAN NOT NULL DEFAULT false;
-- The picture's alternative text, in the quiz's language (the asset is shared across languages).
ALTER TABLE "answer_option" ADD COLUMN "alt" TEXT;
