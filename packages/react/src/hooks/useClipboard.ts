import { useCallback, useRef, type RefObject } from 'react';

export type ClipboardTarget = HTMLInputElement | HTMLTextAreaElement;

export type UseClipboardOptions = {
  selectOnCopy?: boolean;
  selectOnError?: boolean;
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
};

export type UseClipboardResult = {
  copy: (text?: string) => Promise<boolean>;
  target: RefObject<ClipboardTarget | null>;
};

const isInputLike = (node: Element | null): node is ClipboardTarget =>
  !!node && (node.nodeName === 'TEXTAREA' || node.nodeName === 'INPUT');

function writeToClipboard(text: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    // Preferred path — requires a secure context (https / localhost).
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(resolve).catch(reject);

      return;
    }

    // Fallback for insecure contexts where navigator.clipboard is unavailable.
    try {
      const textarea = document.createElement('textarea');

      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.top = '-9999px';
      textarea.style.opacity = '0';

      document.body.appendChild(textarea);
      textarea.select();

      const ok = document.execCommand('copy');

      document.body.removeChild(textarea);

      if (ok) {
        resolve();
      } else {
        reject(new DOMException('The copy command was unsuccessful', 'NotAllowedError'));
      }
    } catch (e) {
      reject(e);
    }
  });
}

export default function useClipboard({
  selectOnCopy,
  selectOnError,
  onSuccess,
  onError
}: UseClipboardOptions = {}): UseClipboardResult {
  const targetRef = useRef<ClipboardTarget | null>(null);
  const optionsRef = useRef<UseClipboardOptions>({});

  // Keep the latest options/callbacks so the stable `copy` never goes stale.
  optionsRef.current = { selectOnCopy, selectOnError, onSuccess, onError };

  const copy = useCallback((text?: string) => {
    const { selectOnCopy, selectOnError, onSuccess, onError } = optionsRef.current;

    if (targetRef.current) {
      text = targetRef.current.value;
    }

    // Resolves to true/false so callers can `await copy()` without risking an
    // unhandled rejection on fire-and-forget calls; callbacks still fire.
    return writeToClipboard(text ?? '').then(() => {
      onSuccess?.();

      if (selectOnCopy && isInputLike(targetRef.current)) {
        targetRef.current.select();
      }

      return true;
    }).catch(e => {
      onError?.(e);

      if (selectOnError && isInputLike(targetRef.current)) {
        targetRef.current.select();
      }

      return false;
    });
  }, []);

  return {
    copy,
    target: targetRef
  };
}
