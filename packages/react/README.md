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
// or flat barrel:
import { useDebouncedValue, AppProvider } from '@byelabel/react';
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

## Repository

[github.com/byelabel/helpers](https://github.com/byelabel/helpers) — see the workspace README for the companion `@byelabel/utils` package.

## License

MIT
