import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { QUESTION_TYPES } from '../../questions/dto/question-content.schema';
import { slideBlockSchema } from '../../slides/dto/slide-content.schema';
import {
  BUNDLE_GUIDE_FILE,
  GUIDE_FIELDS,
  JsonSchema,
  bundleGuideText,
  guideExample,
  jsonSchema as json,
} from './bundle-guide';
import { collectMediaPaths, fromBundle } from './quiz-bundle';
import { quizBundleSchema } from './quiz-bundle.schema';

const ROOT = join(__dirname, '..', '..', '..', '..', '..');

const keys = (s: JsonSchema) => Object.keys(s.properties).sort();
const sorted = ({ described, left }: { described: readonly string[]; left: readonly string[] }) =>
  [...described, ...left].sort();

describe('format guide', () => {
  it('is committed as generated: run `pnpm generate:schema` after changing a content schema', () => {
    const committed = readFileSync(join(ROOT, BUNDLE_GUIDE_FILE), 'utf8');
    expect(committed).toBe(bundleGuideText());
  });

  it('its example imports as is: every question type, a slide, no media', () => {
    const parsed = quizBundleSchema.safeParse(guideExample());
    if (!parsed.success) throw new Error(JSON.stringify(parsed.error.issues));
    expect(collectMediaPaths(parsed.data).size).toBe(0);
    const imported = fromBundle(parsed.data, (path) => {
      throw new Error(`no media expected, got ${path}`);
    });
    // Every type but the image choice, whose answers are pictures.
    expect(imported.questions.map((q) => q.type)).toEqual(
      QUESTION_TYPES.filter((t) => t !== 'image_choice'),
    );
    expect(imported.slides).toHaveLength(1);
  });

  it('sorts every field of the format: described, or left out on purpose', () => {
    const bundle = json(quizBundleSchema);
    const variants = bundle.properties.items.items.oneOf ?? bundle.properties.items.items.anyOf;
    const [question, slide] = ['question', 'slide'].map(
      (kind) => variants.find((b) => b.properties.kind.const === kind)!,
    );
    const blocks = json(slideBlockSchema).anyOf;
    const blockTypes = [
      ...blocks[0].oneOf.map((b) => b.properties.type.const),
      blocks[1].properties.type.const,
    ].sort();

    expect(keys(bundle)).toEqual(sorted(GUIDE_FIELDS.bundle));
    expect(keys(bundle.properties.quiz)).toEqual(sorted(GUIDE_FIELDS.quiz));
    expect(keys(question)).toEqual(sorted(GUIDE_FIELDS.question));
    expect(keys(question.properties.options.items)).toEqual(sorted(GUIDE_FIELDS.option));
    expect(keys(slide)).toEqual(sorted(GUIDE_FIELDS.slide));
    expect(blockTypes).toEqual(sorted(GUIDE_FIELDS.block));
  });
});
