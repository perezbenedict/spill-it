'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { CODE_ALPHABET, CODE_LENGTH, isValidPublicCode } from '@/lib/session-code';

// Keep only unambiguous code characters so users cannot type a rejected glyph.
function sanitize(value) {
  return value
    .toUpperCase()
    .split('')
    .filter((char) => CODE_ALPHABET.includes(char))
    .join('')
    .slice(0, CODE_LENGTH);
}

export default function CodeEntry() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [touched, setTouched] = useState(false);

  const valid = isValidPublicCode(code);
  const showError = touched && !valid;

  function handleSubmit(event) {
    event.preventDefault();
    if (!valid) {
      setTouched(true);
      return;
    }
    router.push(`/join/${code}`);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-2">
      <label htmlFor="session-code" className="text-sm font-medium text-ink">
        Have a session code?
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="session-code"
          value={code}
          onChange={(event) => setCode(sanitize(event.target.value))}
          onBlur={() => setTouched(true)}
          placeholder="e.g. ABCDEF23"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={CODE_LENGTH}
          aria-invalid={showError || undefined}
          aria-describedby="session-code-hint"
          className="text-base tracking-widest placeholder:tracking-normal"
        />
        <Button type="submit" size="lg" disabled={!valid} className="w-full sm:w-auto">
          Join
        </Button>
      </div>
      {showError ? (
        <p id="session-code-hint" role="alert" className="text-xs font-medium text-danger">
          Codes are {CODE_LENGTH} characters with no 0, O, 1, I or L - check it and try
          again.
        </p>
      ) : (
        <p id="session-code-hint" className="text-xs text-muted">
          {CODE_LENGTH} characters from your moderator. No 0, O, 1, I or L.
        </p>
      )}
    </form>
  );
}
