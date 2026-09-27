-- Media on slides (#125): a video background loops and plays its sound unless told
-- otherwise; the slide's sound may reach other devices than the game's default.
ALTER TABLE "slide"
  ADD COLUMN "background_loop" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "background_sound" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "audio_target" "AudioTarget";
