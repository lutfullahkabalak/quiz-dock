-- Media on slides (#125), set like a question's: a video filling the slide behind
-- its content (looped, with its sound, unless said otherwise) and a sound, whose
-- waveform the screens do not draw by default. A video with its sound excludes
-- the sound — a rule of the API, the kinds sit on `media_asset`.
ALTER TABLE "slide"
  ADD COLUMN "video_media_id" CHAR(26),
  ADD COLUMN "video_loop" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "video_sound" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "audio_media_id" CHAR(26),
  ADD COLUMN "waveform_size" "WaveformSize" NOT NULL DEFAULT 'hidden',
  ADD COLUMN "audio_target" "AudioTarget";
ALTER TABLE "slide" ADD CONSTRAINT "slide_video_media_id_fkey"
  FOREIGN KEY ("video_media_id") REFERENCES "media_asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "slide" ADD CONSTRAINT "slide_audio_media_id_fkey"
  FOREIGN KEY ("audio_media_id") REFERENCES "media_asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
