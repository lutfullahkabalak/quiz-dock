import { ChevronRight, CircleArrowUp, Copy, ExternalLink } from 'lucide-react';
import type { LatestRelease } from '@quiz-dock/contracts';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Markdown } from '@/components/markdown';
import { Button, buttonVariants } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { cn } from '@/lib/utils';
import { useReadOperation } from './admin-api';

/** The version hidden in this browser, until a newer one is out. */
const HIDDEN_KEY = 'qd-admin-update-hidden';

function hiddenVersion(): string | null {
  try {
    return localStorage.getItem(HIDDEN_KEY);
  } catch {
    return null;
  }
}

/**
 * A newer stable release is out (`UPDATE_CHECK`), above every page of the
 * administration until this browser hides it.
 */
export function UpdateNotice() {
  const { t } = useTranslation('admin');
  const status = useReadOperation('version.check').data?.data;
  const [hidden, setHidden] = useState(hiddenVersion);
  const latest = status?.latest;
  if (!status?.updateAvailable || !latest || hidden === latest.version) return null;

  const hide = () => {
    setHidden(latest.version);
    try {
      localStorage.setItem(HIDDEN_KEY, latest.version);
    } catch {
      // private window, storage blocked: hidden for this visit
    }
  };

  return (
    <Notice
      tone="info"
      role="status"
      icon={<CircleArrowUp aria-hidden className="text-muted-foreground mt-0.5 size-4 shrink-0" />}
    >
      <UpdateDetails
        current={status.current}
        latest={latest}
        action={
          <Button type="button" size="sm" variant="ghost" className="ml-auto" onClick={hide}>
            {t('update.hide')}
          </Button>
        }
      />
    </Notice>
  );
}

/**
 * The newer release: which one, what to read before, what changes, and the
 * command that installs it on the server — the web installs nothing. The
 * notice and the health page's Version card show the same.
 */
export function UpdateDetails({
  current,
  latest,
  action,
}: {
  current: string;
  latest: LatestRelease;
  /** Last on the row of links: hide the notice, close the dialog. */
  action?: ReactNode;
}) {
  const { t, i18n } = useTranslation('admin');
  const [copied, setCopied] = useState(false);
  const command = `./quizdock upgrade ${latest.version}`;
  const date = latest.publishedAt
    ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long' }).format(
        new Date(latest.publishedAt),
      )
    : '';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // No clipboard (plain http): the command stays selectable.
    }
  };

  return (
    <div className="flex flex-col gap-2 text-sm">
      <p>
        <span className="font-medium">{t('update.available', { version: latest.version })}</span>{' '}
        <span className="text-muted-foreground">{t('update.running', { current, date })}</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground">{t('update.command')}</span>
        <code className="bg-background max-w-full overflow-x-auto rounded-sm border px-2 py-1 text-xs select-all">
          {command}
        </code>
        <Button type="button" size="sm" variant="outline" onClick={() => void copy()}>
          <Copy aria-hidden className="size-4" />
          {copied ? t('update.copied') : t('update.copy')}
        </Button>
      </div>
      <p className="text-muted-foreground">{t('update.does')}</p>
      {latest.upgrading.length ? (
        <ReleaseList title={t('update.upgrading')} items={latest.upgrading} markdown open />
      ) : null}
      {latest.changes.length ? (
        <ReleaseList title={t('update.changes')} items={latest.changes} />
      ) : null}
      <div className="flex flex-wrap items-center gap-1">
        {latest.url ? (
          <a
            href={latest.url}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
          >
            {t('update.github')}
            <ExternalLink aria-hidden className="size-4" />
          </a>
        ) : null}
        {action}
      </div>
    </div>
  );
}

/** A section of the release's notes, folded unless it must be read first. */
function ReleaseList({
  title,
  items,
  markdown = false,
  open = false,
}: {
  title: string;
  items: string[];
  markdown?: boolean;
  open?: boolean;
}) {
  return (
    <details open={open} className="group">
      <summary className="flex cursor-pointer items-center gap-1 font-medium select-none">
        <ChevronRight
          aria-hidden
          className="text-muted-foreground size-4 shrink-0 transition-transform group-open:rotate-90"
        />
        {title}
      </summary>
      <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-9">
        {items.map((item) => (
          <li key={item} className="break-words">
            {markdown ? <Markdown profile="inline">{item}</Markdown> : item}
          </li>
        ))}
      </ul>
    </details>
  );
}
