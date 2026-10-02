import { CircleCheck, Smartphone } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { type FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SettingsList } from '@quiz-dock/contracts';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { apiErrorText } from '../../api/http';
import { useRunOperation } from './admin-api';
import { useOperationAction } from './use-operation-action';
import { WEB_CHANGES_DOC } from './settings-model';

/** How long the server keeps a phone test (PHONE_TEST_TTL_S). */
const PHONE_TEST_MS = 10 * 60_000;

/** An address as an invitation takes it: an http(s) origin, nothing after it. */
const originOf = (text: string): string | null => {
  try {
    const url = new URL(text.trim());
    return /^https?:$/.test(url.protocol) ? url.origin : null;
  } catch {
    return null;
  }
};

/**
 * The phone test of every candidate invitation address (§3.8): in the wizard,
 * and again from the administration — a new network, a new venue. From the
 * administration (`adopt`), an address a phone reached becomes the instance's
 * invitation address (`APP_PUBLIC_URL`), the one every lobby starts from.
 */
export function PhoneTests({ data, adopt = false }: { data: SettingsList; adopt?: boolean }) {
  const { t } = useTranslation('admin');
  const publicRow = data.rows.find((r) => r.key === 'APP_PUBLIC_URL');
  const publicUrl =
    typeof publicRow?.value === 'string' && publicRow.value ? publicRow.value : null;
  const lan =
    (data.rows.find((r) => r.key === 'HOST_LAN_IPS')?.value as string[] | undefined) ?? [];
  const port = window.location.port ? `:${window.location.port}` : '';
  const [added, setAdded] = useState<string[]>([]);
  const [other, setOther] = useState('');
  const candidates = [
    ...new Set(
      [
        publicUrl,
        ...lan.map((ip) => `${window.location.protocol}//${ip}${port}`),
        window.location.origin,
        ...added,
      ].filter((x): x is string => !!x),
    ),
  ];
  const { access } = data;
  const writable =
    access.scope === 'write' &&
    !publicRow?.locked &&
    !(access.tokenRequired && !access.tokenSet) &&
    !access.safeMode;
  const add = (e: FormEvent) => {
    e.preventDefault();
    const origin = originOf(other);
    if (!origin) return;
    setAdded((list) => [...list, origin]);
    setOther('');
  };
  return (
    <section id="phone-test" className="flex flex-col gap-2">
      <h2 className="flex items-center gap-2 font-semibold">
        <Smartphone aria-hidden className="size-5" />
        {t('setup.phone.title')}
      </h2>
      <p className="text-muted-foreground text-sm">{t('setup.phone.help')}</p>
      {adopt ? (
        <p className="text-muted-foreground text-sm">
          {writable ? t('setup.phone.adoptHelp') : t('setup.phone.adoptReadOnly')}
          {writable ? null : (
            <>
              {' '}
              <a href={WEB_CHANGES_DOC} target="_blank" rel="noreferrer" className="underline">
                {t('settings.access.doc')}
              </a>
            </>
          )}
        </p>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        {candidates.map((address) => (
          <PhoneTest
            key={address}
            address={address}
            current={address === publicUrl}
            adopt={adopt && writable}
          />
        ))}
      </div>
      {adopt ? (
        <form onSubmit={add} className="flex flex-wrap items-center gap-2">
          <label htmlFor="phone-test-other" className="text-sm">
            {t('setup.phone.other')}
          </label>
          <Input
            id="phone-test-other"
            value={other}
            onChange={(e) => setOther(e.target.value)}
            placeholder="http://192.168.1.20:18080"
            className="max-w-xs"
          />
          <Button type="submit" size="sm" variant="outline" disabled={!originOf(other)}>
            {t('setup.phone.add')}
          </Button>
        </form>
      ) : null}
      <details className="rounded-lg border px-3 py-2 text-sm">
        <summary className="cursor-pointer font-medium">{t('setup.phone.why.title')}</summary>
        <ul className="text-muted-foreground mt-2 flex list-disc flex-col gap-1 pl-5">
          {(['network', 'isolation', 'firewall', 'public', 'docker'] as const).map((k) => (
            <li key={k}>{t(`setup.phone.why.${k}`)}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}

/** One candidate address: a QR code to a page only a phone reaching it can open (§3.8). */
function PhoneTest({
  address,
  current,
  adopt,
}: {
  address: string;
  /** The instance's invitation address already. */
  current: boolean;
  /** A reached address may become the instance's invitation address. */
  adopt: boolean;
}) {
  const { t } = useTranslation('admin');
  const run = useRunOperation();
  const action = useOperationAction();
  const [test, setTest] = useState<{ id: string; url: string } | null>(null);
  const [reached, setReached] = useState<{ agent: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    if (!test || reached) return;
    const started = Date.now();
    const timer = setInterval(() => {
      // As long as the test lives on the server, and while the page is looked at.
      if (Date.now() - started > PHONE_TEST_MS) {
        clearInterval(timer);
        setExpired(true);
        return;
      }
      if (document.hidden) return;
      void run('invite.test-status', { id: test.id })
        .then((a) => {
          const r =
            a.kind === 'result'
              ? (a.result.data as { reached: { agent: string } | null }).reached
              : null;
          if (r) setReached(r);
        })
        .catch(() => undefined);
    }, 2000);
    return () => clearInterval(timer);
  }, [test, reached, run]);
  const start = async () => {
    setError(null);
    setReached(null);
    setExpired(false);
    try {
      const a = await run('invite.test', { address });
      if (a.kind === 'result') setTest(a.result.data as { id: string; url: string });
    } catch (err) {
      setError(apiErrorText(err));
    }
  };
  const use = () => void action.act('settings.set', { key: 'APP_PUBLIC_URL', value: address });
  return (
    <Card className="flex flex-col items-start gap-2 p-4">
      <code className="text-sm break-all">{address}</code>
      {current ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <CircleCheck aria-hidden className="size-4" />
          {t('setup.phone.current')}
        </p>
      ) : null}
      {test ? (
        reached ? (
          <p role="status" className="text-success flex items-center gap-2 text-sm font-medium">
            <CircleCheck aria-hidden className="size-4" />
            {t('setup.phone.reached', { agent: reached.agent })}
          </p>
        ) : expired ? (
          <p className="text-muted-foreground text-sm">{t('setup.phone.expired')}</p>
        ) : (
          <>
            <QRCodeSVG value={test.url} size={160} marginSize={2} className="bg-white" />
            <p className="text-muted-foreground text-xs">{t('setup.phone.scan')}</p>
          </>
        )
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => void start()}>
          {t(test ? 'setup.phone.again' : 'setup.phone.start')}
        </Button>
        {adopt && reached && !current ? (
          <Button type="button" size="sm" disabled={action.busy} onClick={use}>
            {t('setup.phone.use')}
          </Button>
        ) : null}
      </div>
      {error || action.error ? (
        <p className="text-destructive text-sm">{error ?? action.error}</p>
      ) : null}
      {action.confirmDialog}
    </Card>
  );
}
