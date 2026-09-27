# QuizDock — Image choice (`image_choice`)

> A question whose answers are pictures, each with the colour and shape of its
> position, as a text answer's. The reference for the type: the decisions taken
> and how it is delivered. Data layout: [données §2.3–2.4](./SPECIFICATIONS-DONNEES.md);
> scoring: [technique §4](./SPECIFICATIONS.md).

## 1. The type

- **2 or 4 pictures**, never 3: one row of two, or two rows of two.
- **One right picture**, or several when the question sets `multiSelect`
  (one type with a setting, not a second type).
- Each answer is a picture from the media library (the same content checks and
  size limits as any media) with its **alternative text**, required. No text,
  no mix of text and picture in one question.
- The **prompt** is a question's usual prompt (Markdown, same limits).
- **No visual of the question's own** (neither image nor video): the answers
  are the pictures. A **sound is allowed** ("which picture goes with this
  sound?"), and so is a background.

Every rule is carried by the API content schema and checked again by the
server, never by the editor alone. The server also checks that each picture
exists, belongs to the author (or is already held by the question) and is an
image.

## 2. Decisions

| Subject | Decision | Why |
|---|---|---|
| Field name | `type: 'image_choice'` | `type` is how every question names its kind; `kind` tells a question from a slide in the bundle. |
| Model | The flat question model, one more `case` in the per-type rules | No discriminated union exists; building one is a refactor out of scope. |
| Alternative text | On the **option** (`answer_option.alt`), not the asset | Quizzes are monolingual and one picture serves quizzes in several languages. |
| Single or multiple | `multiSelect` on the question | One entry in the type picker. Multiple is scored as a multiple choice, `partial` credit included; single as a single choice. |
| Scoring | Reused from single / multiple choice | Speed weighting, streaks, `double` and `fixed` points apply; `closest` and `lenient` are not offered. |
| Colours and shapes | By position, in the order of the other choice types | Same order on the projection, the players' phones and the editor's preview. |
| Shape badge | A white shape in a square of the option's colour, with a halo | Readable over any picture. |
| Player in the room | Shapes only, as for text answers | The pictures are on the projection. |
| Player at a distance | The whole grid, colours and shapes | No projection in front of them; the big screen view (#104) shows the projection too. |
| Tile | `TILE_RATIO` (4:3, provisional), picture in `object-fit: cover` | To settle on a projector with pictures of various proportions. |
| Bundle | Version 6, stamped only by a quiz holding an image choice | A quiz without one still imports into an older instance. An older importer refuses a v6 bundle with its generic message. |
| Text-only format guide | Leaves the type out | Its answers are pictures, which a text-only file cannot hold. |

## 3. Out of scope

Three pictures, a poll in pictures, text and pictures mixed in one question, an
adjustable focal point, cropping at upload, video in the tiles.

## 4. Delivery

One commit per phase on `feat/image-choice`:

1. **Contract and validation** — the type, `multiSelect`, the option's `alt`,
   `TILE_RATIO`, the server rules and picture checks, bundle version 6.
2. **Game engine** — scoring, reveal and distribution reused from the choice
   types; the live payloads.
3. **Editor** — pictures from the library, required `alt`, crop preview, 2 or 4
   answers, single or multiple.
4. **Projection and reveal** — the grid fills the screen; wrong tiles dimmed,
   the right one(s) highlighted, counts with a thumbnail.
5. **Player views** — shapes in the room, the grid at a distance.
6. **History and CSV** — the prompt as the question's label, the `alt` as the
   option's; never an asset id.
7. **i18n** — labels and descriptions in every locale.
