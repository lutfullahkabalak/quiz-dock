import { useMemo, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Pagination } from '@/components/ui/pagination';
import { TagFilter, tagsOf } from '@/components/tag-filter';
import { ListSkeleton, LoadFailed } from '@/components/ui/loading';
import {
  useCommunityControllerList,
  useCommunityControllerPreview,
  useCommunityControllerTake,
} from '../api/generated/community-store/community-store';
import { getQuizzesControllerListQueryKey } from '../api/generated/quizzes/quizzes';
import { apiErrorText } from '../api/http';
import { useRole } from '../auth/use-role';
import { hasCommunityStore } from '../config';
import { fold } from '@/lib/text';

export function CommunityPage() {
  const { t } = useTranslation(['store', 'dashboard']);
  const list = useCommunityControllerList({ query: { enabled: hasCommunityStore() } });
  const take = useCommunityControllerTake();
  const [selected, setSelected] = useState('');
  const preview = useCommunityControllerPreview(selected, { query: { enabled: !!selected } });
  const [search, setSearch] = useState('');
  const [language, setLanguage] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const { isHost } = useRole();
  const navigate = useNavigate();
  const client = useQueryClient();
  const entries = useMemo(() => list.data?.data.entries ?? [], [list.data]);
  const allTags = useMemo(() => tagsOf(entries), [entries]);
  const languages = [...new Set(entries.map((e) => e.language))].sort();
  const filtered = entries.filter(
    (e) =>
      (!language || e.language === language) &&
      tags.every((tag) => e.tags.includes(tag)) &&
      fold(`${e.title} ${e.description ?? ''} ${e.author}`).includes(fold(search)),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 20));
  const current = Math.min(page, pages);
  const create = async (key: string) => {
    try {
      const { data } = await take.mutateAsync({ data: { key } });
      await client.invalidateQueries({ queryKey: getQuizzesControllerListQueryKey() });
      await navigate({ to: '/quizzes/$quizId', params: { quizId: data.id } });
    } catch {
      /* The mutation's error is displayed below. */
    }
  };
  if (!hasCommunityStore()) return null;
  return (
    <section className="flex flex-col gap-4">
      <Link to="/templates" className="underline">
        {t('backToCatalogue')}
      </Link>
      <h1 className="text-2xl font-bold">{t('community.title')}</h1>
      <p className="text-muted-foreground">{t('community.intro')}</p>
      {list.isPending ? <ListSkeleton variant="list" rows={4} /> : null}
      {list.isError ? <LoadFailed error={list.error} /> : null}
      {list.data?.data.unavailable.length ? <p role="alert">{t('community.unavailable')}</p> : null}
      {take.error ? (
        <p role="alert" className="text-destructive">
          {apiErrorText(take.error, t('takeFailed'))}
        </p>
      ) : null}
      {list.isSuccess && !entries.length ? <p>{t('community.empty')}</p> : null}
      {entries.length ? (
        <>
          <div className="flex gap-3 flex-wrap">
            <Input
              aria-label={t('search')}
              placeholder={t('search')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
            <Select
              aria-label={t('dashboard:filterLanguage')}
              value={language}
              onChange={(e) => {
                setLanguage(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{t('dashboard:languageAll')}</option>
              {languages.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </Select>
          </div>
          <TagFilter
            label={t('dashboard:filterTags')}
            tags={allTags}
            selected={tags}
            onChange={(next) => {
              setTags(next);
              setPage(1);
            }}
          />
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.slice((current - 1) * 20, current * 20).map((entry) => (
              <li key={entry.key} className="border rounded-lg p-4 flex flex-col gap-2">
                <h2 className="font-semibold">{entry.title}</h2>
                <p>{entry.description}</p>
                <p className="text-sm">
                  {entry.author} · {entry.language} ·{' '}
                  {t('questionCount', { count: entry.questionCount })}
                </p>
                <p className="text-sm">{t('licence', { name: entry.license })}</p>
                <a
                  href={entry.source}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-sm break-all"
                >
                  {t('community.source', { source: entry.id })}
                </a>
                {entry.reportUrl ? (
                  <a
                    href={entry.reportUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-sm"
                  >
                    {t('community.report')}
                  </a>
                ) : null}
                <Button variant="outline" onClick={() => setSelected(entry.key)}>
                  {t('open')}
                </Button>
                {isHost ? (
                  <Button disabled={take.isPending} onClick={() => void create(entry.key)}>
                    {t('createFrom')}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          <Pagination page={current} pages={pages} onChange={setPage} />
        </>
      ) : null}
      {selected ? (
        <div className="border rounded-lg p-4 space-y-3">
          <Button variant="outline" onClick={() => setSelected('')}>
            {t('community.closePreview')}
          </Button>
          {preview.isPending ? <ListSkeleton variant="list" rows={3} /> : null}
          {preview.error ? <LoadFailed error={preview.error} /> : null}
          {preview.data ? (
            <>
              <h2 className="font-semibold">{preview.data.data.title}</h2>
              <p>{t('community.previewHint')}</p>
              <ol className="list-decimal pl-5 space-y-3">
                {preview.data.data.items.map((item, i) => (
                  <li key={i}>
                    <p className="whitespace-pre-wrap">{item.text || t('slide')}</p>
                    <ul className="list-disc pl-5">
                      {item.options.map((o, j) => (
                        <li key={j}>{o}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
