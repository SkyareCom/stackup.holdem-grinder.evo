import React, { useState } from 'react';
import StackUpScenarioCinematicFilter from './StackUpScenarioCinematicFilter.jsx';
import { getFilterByKey } from '../core/stackup-scenario-catalog.esm.js';
export default function ScenarioCatalogExample(){
  const [keys,setKeys]=useState([]);
  const scenarioQuery={filters:keys,match:'OR'};
  const hands=[{id:'example-1',filters:['mode:cash','seats:s9']},{id:'example-2',filters:['mode:mtt','seats:s6']}];
  const matchingHands=keys.length ? hands.filter(h=>h.filters.some(key=>keys.includes(key))) : hands;
  return <><StackUpScenarioCinematicFilter onSelectionChange={setKeys}/><pre>{JSON.stringify({scenarioQuery,matchingHands,selected:keys.map(getFilterByKey)},null,2)}</pre></>;
}
