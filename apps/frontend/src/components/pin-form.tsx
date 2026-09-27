import { useNavigate } from '@tanstack/react-router';
import { type FormEvent, type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * The PIN a participant types to join a game, sent on to its page (`/join/$pin`),
 * which decides between a new join and taking a place back. `stacked`: the label
 * shown above, the button below; otherwise one line, the label for screen readers.
 */
export function PinForm({
  label,
  placeholder,
  submit,
  stacked = false,
  autoFocus = false,
}: {
  label: string;
  placeholder: string;
  submit: ReactNode;
  stacked?: boolean;
  autoFocus?: boolean;
}) {
  const navigate = useNavigate();
  const [pin, setPin] = useState('');
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const code = pin.trim();
    if (code) void navigate({ to: '/join/$pin', params: { pin: code } });
  };
  const input = (
    <Input
      autoFocus={autoFocus}
      value={pin}
      onChange={(e) => setPin(e.target.value)}
      inputMode="numeric"
      maxLength={6}
      placeholder={placeholder}
      aria-label={stacked ? undefined : label}
      className="text-center text-lg tracking-[0.3em]"
      required
    />
  );
  return (
    <form className={stacked ? 'flex flex-col gap-4 text-left' : 'flex gap-2'} onSubmit={onSubmit}>
      {stacked ? (
        <Label>
          {label}
          {input}
        </Label>
      ) : (
        input
      )}
      <Button type="submit" disabled={!pin.trim()}>
        {submit}
      </Button>
    </form>
  );
}
