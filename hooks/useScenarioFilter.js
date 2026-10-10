import { useCallback, useMemo, useState } from 'react';
import { getFilterByKey } from '../core/stackup-scenario-catalog.esm.js';
export function useScenarioFilter(initialKeys = []) {
  const [selectedKeys, setSelectedKeys] = useState(() => new Set(initialKeys.filter(k => getFilterByKey(k))));
  const toggle = useCallback(key => { if (!getFilterByKey(key)) return; setSelectedKeys(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; }); }, []);
  const clear = useCallback(() => setSelectedKeys(new Set()), []);
  const keys = useMemo(() => [...selectedKeys], [selectedKeys]);
  const buildScenarioQuery = useCallback(() => ({ filters: keys, match: 'OR' }), [keys]);
  return { selectedKeys, keys, toggle, clear, setSelectedKeys, buildScenarioQuery };
}
export default useScenarioFilter;
