# @byelabel/react

Client-side React hooks and a tiny generic context. Zero non-React deps.

```bash
pnpm add @byelabel/react react react-dom
# or
npm install @byelabel/react react react-dom
```

ESM only. React 18+ peer.

## Imports

```ts
import { useDebouncedValue, useTimeout } from '@byelabel/react/hooks';
import { AppProvider, useAppContext } from '@byelabel/react/contexts';
import { stringToColor, hexToRGBA, shader } from '@byelabel/react/color';
// or flat barrel:
import { useDebouncedValue, AppProvider, stringToColor } from '@byelabel/react';
```

## Hooks

### `useDebouncedValue<T>(value, delay = 300): T`

```tsx
const debounced = useDebouncedValue(query, 300);

useEffect(() => {
  fetchResults(debounced);
}, [debounced]);
```

### `useDebounceEffect(fn, waitTime, deps)`

`useEffect` with a debounce. Runs `fn(...deps)` after `waitTime` ms of stillness.

```tsx
useDebounceEffect(([q]) => {
  search(q);
}, 250, [query]);
```

### `useTimeout(callback, delay | null)`

Setup a one-shot timer that uses the latest `callback`. Pass `null` to pause.

```tsx
useTimeout(() => setVisible(false), open ? 3000 : null);
```

### `useInterval(callback, delay | null)`

Same as `useTimeout` but recurring.

```tsx
useInterval(() => refetch(), 5000);
```

### `useIsomorphicLayoutEffect`

`useLayoutEffect` in browsers, `useEffect` during SSR.

```tsx
useIsomorphicLayoutEffect(() => measureLayout(), [size]);
```

### `useMounted(): () => boolean`

```tsx
const isMounted = useMounted();
fetch('/x').then(r => { if (isMounted()) setData(r); });
```

### `useIsInit(): boolean`

`true` on first render, `false` thereafter.

```tsx
if (useIsInit()) {
  console.log('first paint');
}
```

### `useIsMobile(): boolean`

Tracks `window.innerWidth < 768` via `matchMedia`.

```tsx
const isMobile = useIsMobile();
return isMobile ? <MobileNav/> : <DesktopNav/>;
```

### `useCountdown(date)`

```tsx
const { days, hours, minutes, seconds } = useCountdown('2026-12-31T23:59:59Z');
```

### `useScript(src, options?): 'idle' | 'loading' | 'ready' | 'error'`

Inject a `<script>` tag once and watch its load state.

```tsx
const status = useScript('https://js.stripe.com/v3/', { position: 'head-end' });
if (status === 'ready') initStripe();
```

### `useTabs<T>(defaultTab)`

```tsx
const { currentTab, setCurrentTab, onChangeTab } = useTabs(0);

<Tabs value={currentTab} onChange={onChangeTab}>...</Tabs>
```

### `useTable(props?)`

Table state for sort/paginate/select. Plus three pure helpers: `descendingComparator`, `getComparator`, `emptyRows`.

```tsx
const t = useTable({ defaultOrderBy: 'created_at', defaultRowsPerPage: 10 });

const sorted = [...rows].sort(getComparator<Row>(t.order, 'created_at'));
const empty  = emptyRows(t.page, t.rowsPerPage, rows.length);
```

## Contexts

### `AppProvider<T>` / `useAppContext<T>()`

Generic state container — useful as a building block when you don't need a reducer.

```tsx
import { AppProvider, useAppContext } from '@byelabel/react/contexts';

type State = { count: number };

function Counter() {
  const { state, setState } = useAppContext<State>();

  return (
    <button onClick={() => setState({ count: state.count + 1 })}>
      {state.count}
    </button>
  );
}

export default function App() {
  return (
    <AppProvider initial={{ count: 0 }}>
      <Counter/>
    </AppProvider>
  );
}
```

`useAppContext` throws if used outside `<AppProvider>`.

## Color utilities

Pure functions for working with hex colors. Framework-agnostic — usable outside React.

### `stringToColor(str): string`

Deterministic hex color derived from any string. Useful for avatar backgrounds, tag chips, or any "stable color per identifier" UI.

```ts
const bg = stringToColor(user.email); // e.g. '#3F8AC2'

<Avatar style={{ backgroundColor: bg }}>{user.initials}</Avatar>
```

### `hexToRGBA(hex, opacity): string`

Converts a 3- or 6-digit hex (with or without `#`) to a CSS `rgba()` string.

```ts
hexToRGBA('#FF8800', 0.5); // 'rgba(255, 136, 0, 0.5)'
hexToRGBA('0F0', 0.25);    // 'rgba(0, 255, 0, 0.25)'

<div style={{ boxShadow: `0 4px 12px ${hexToRGBA(theme.primary, 0.25)}` }} />
```

### `shader(hex, percent?): string`

Lightens (`percent > 0`) or darkens (`percent < 0`) a 6-digit hex color. Channels are clamped to 255. Defaults to `0` (no-op).

```ts
shader('#336699',  50); // '#4c99e5' — 50% lighter
shader('#336699', -50); // '#19334c' — 50% darker
shader('#FFFFFF',  50); // '#ffffff' — clamped
```

## Repository

[github.com/byelabel/helpers](https://github.com/byelabel/helpers) — see the workspace README for the companion `@byelabel/utils` package.

## License

MIT
