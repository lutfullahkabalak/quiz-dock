# Sample quizzes

One folder per sample, in the bundle format ([docs/quiz-bundle.md](../../../docs/quiz-bundle.md)):
`quiz.json` next to its `media/`. The folder's name identifies the sample from one release to
the next: the catalogue replaces a sample in place when its `quiz.revision` goes up.

The media come from Wikimedia Commons, in the public domain or under CC BY (no SA, NC or ND,
so they fit a CC BY 4.0 quiz). `sources.json` lists where each came from; to fetch or change
them, edit it and run, from the repository root (Docker only):

```sh
tools/sample-media/run.sh [<folder>] [--force]
```

It writes the files under `media/` and each file's name, alt text, credit (and a sound's
waveform and loudness) into the `media` map of `quiz.json`. `samples.spec.ts` checks every
sample: a bundle the importer takes, every step complete, every question type, every media
credited and used.
