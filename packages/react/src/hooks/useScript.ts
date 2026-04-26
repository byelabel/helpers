import { useEffect, useState } from 'react';

export type ScriptStatus = 'idle' | 'loading' | 'ready' | 'error';
export type ScriptPosition = 'head-start' | 'head-end' | 'body-start' | 'body-end';

export type UseScriptOptions = {
  enable?: boolean;
  position?: ScriptPosition;
};

export default function useScript(src: string, options?: UseScriptOptions): ScriptStatus {
  const { enable = true, position = 'body-end' } = options ?? {};
  const [status, setStatus] = useState<ScriptStatus>(src ? 'loading' : 'idle');

  useEffect(() => {
    if (!(src && enable)) {
      setStatus('idle');
      return;
    }

    let script = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);

    if (script) {
      setStatus((script.getAttribute('data-status') as ScriptStatus) ?? 'loading');
    } else {
      script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.setAttribute('data-status', 'loading');

      if (position === 'head-start') {
        document.head.insertBefore(script, document.head.childNodes[0]);
      } else if (position === 'head-end') {
        document.head.appendChild(script);
      } else if (position === 'body-start') {
        document.body.insertBefore(script, document.body.childNodes[0]);
      } else {
        document.body.appendChild(script);
      }

      const setAttributeFromEvent = (event: Event) => {
        script?.setAttribute('data-status', event.type === 'load' ? 'ready' : 'error');
      };

      script.addEventListener('load', setAttributeFromEvent);
      script.addEventListener('error', setAttributeFromEvent);
    }

    const setStateFromEvent = (event: Event) => {
      setStatus(event.type === 'load' ? 'ready' : 'error');
    };

    script.addEventListener('load', setStateFromEvent);
    script.addEventListener('error', setStateFromEvent);

    return () => {
      script?.removeEventListener('load', setStateFromEvent);
      script?.removeEventListener('error', setStateFromEvent);
    };
  }, [enable, position, src]);

  return status;
}
