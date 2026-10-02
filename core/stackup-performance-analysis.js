/* StackUp Grinder — detailed performance analysis and actionable SWOT. */
(function(global){
  'use strict';

  function clone(v){try{return structuredClone(v);}catch(_){try{return JSON.parse(JSON.stringify(v));}catch(__){return {};}}}
  function pct(v){return (Number(v)||0).toFixed(1).replace('.',',')+'%';}
  function counts(records){
    const total=(records||[]).length;
    const correct=(records||[]).filter(r=>r?.status==='correct').length;
    const adjustable=(records||[]).filter(r=>r?.status==='adjustable').length;
    const incorrect=(records||[]).filter(r=>r?.status==='incorrect').length;
    return {
      total,correct,adjustable,incorrect,
      accuracy:total?correct/total*100:0,
      technical:total?(correct+adjustable*.5)/total*100:0,
      adjustableRate:total?adjustable/total*100:0,
      incorrectRate:total?incorrect/total*100:0
    };
  }
  function ordered(records,desc){
    return [...(records||[])].sort((a,b)=>desc?String(b?.answeredAt||'').localeCompare(String(a?.answeredAt||'')):String(a?.answeredAt||'').localeCompare(String(b?.answeredAt||'')));
  }
  function trend(records){
    const o=ordered(records,true);
    if(o.length<10)return {delta:0,recent:counts(o),previous:counts([]),enough:false};
    const n=Math.min(25,Math.floor(o.length/2));
    const recent=counts(o.slice(0,n)),previous=counts(o.slice(n,n*2));
    return {delta:recent.technical-previous.technical,recent,previous,enough:previous.total>0};
  }
  function scenarioValue(record,key){
    const sc=record?.scenario||{},f=record?.filters||{};
    if(key==='effectiveStack')return Number(sc.effectiveStack??f.effectiveStack??(Array.isArray(f.effectiveStacks)&&f.effectiveStacks.length===1?f.effectiveStacks[0]:NaN))||null;
    if(key==='phase')return f.phase||((Array.isArray(f.phases)&&f.phases.length===1)?f.phases[0]:null);
    return sc[key]??f[key]??record?.[key]??null;
  }
  function addGroup(map,key,record){
    if(key===null||key===undefined||key==='')return;
    const k=String(key);
    if(!map.has(k))map.set(k,[]);
    map.get(k).push(record);
  }
  function grouped(records,dimension){
    const map=new Map();
    (records||[]).forEach(r=>{
      if(dimension==='section'){
        const vals=Array.isArray(r?.sections)&&r.sections.length?r.sections:[r?.street||'GERAL'];
        vals.forEach(v=>addGroup(map,v,r));
      }else if(dimension==='position')addGroup(map,r?.heroPosition,r);
      else if(dimension==='street')addGroup(map,r?.street,r);
      else if(dimension==='stack'){
        const v=scenarioValue(r,'effectiveStack');if(v)addGroup(map,String(v)+'BB',r);
      }else if(dimension==='phase')addGroup(map,scenarioValue(r,'phase'),r);
      else if(dimension==='action')addGroup(map,r?.chosenAction,r);
      else if(dimension==='training')addGroup(map,r?.training,r);
    });
    return [...map.entries()].map(([name,items])=>{
      const c=counts(items),t=trend(items);
      return {dimension,name,items,counts:c,trend:t};
    });
  }
  function latestFilters(item){
    const r=ordered(item.items,true)[0]||{};
    return clone(r.filters||{});
  }
  function trainingFilters(item,target){
    const f=latestFilters(item);
    if(item.dimension==='position')f.heroPositions=[String(item.name)];
    if(item.dimension==='street')f.streets=[String(item.name)];
    if(item.dimension==='stack'){
      const n=Number(String(item.name).replace(/[^0-9.]/g,''));
      if(Number.isFinite(n)&&n>0)f.effectiveStacks=[n];
    }
    if(item.dimension==='phase')f.phases=[String(item.name)];
    f.sampleSize=target;
    return f;
  }
  function langText(lang){
    const pt={
      dim:{section:'assunto',position:'posição',street:'street',stack:'stack',phase:'fase',action:'ação',training:'treino'},
      weakComment:(d,n)=>'O padrão em '+d+' '+n+' ainda não está consolidado. O problema não é apenas o número bruto de erros: a combinação entre erros, decisões ajustáveis e score técnico indica dificuldade recorrente para reconhecer a linha dominante.',
      weakRisk:(d,n)=>'Se esse padrão continuar, decisões semelhantes em '+n+' tendem a consumir EV repetidamente e podem contaminar cenários próximos.',
      weakAction:(n,target)=>'Executar uma sessão direcionada de '+target+' spots em '+n+', revisar todos os erros e comparar ação escolhida, ação indicada e frequência do solver antes de avançar.',
      oppComment:(n)=>n+' está em uma zona intermediária: há base suficiente para evoluir rápido, mas a quantidade de decisões ajustáveis mostra que os mixes ainda não estão automatizados.',
      oppRisk:(n)=>'Sem reforço, '+n+' pode permanecer dependente de intuição e variar muito entre sessões.',
      oppAction:(n,target)=>'Fazer '+target+' spots de reforço em '+n+', priorizando spots mistos e decisões de frequência.',
      strengthComment:(n)=>n+' apresenta desempenho consistente na amostra atual e pode ser usado como referência para comparar outras áreas do jogo.',
      strengthRisk:(n)=>'O principal risco em '+n+' é reduzir a frequência de revisão e perder consistência com o tempo.',
      strengthAction:(n)=>'Manter sessões curtas de manutenção e aumentar gradualmente a complexidade sem abandonar a revisão.',
      threatTrend:(n,d)=>n+' apresenta regressão recente de '+Math.abs(d).toFixed(1).replace('.',',')+' pontos percentuais no score técnico.',
      threatErrors:(n,r)=>n+' concentra '+r.toFixed(1).replace('.',',')+'% de decisões incorretas na amostra.',
      threatRisk:(n)=>'A combinação de volume com desempenho fraco transforma '+n+' em ameaça prática: o leak já aparece com frequência suficiente para afetar o resultado global.',
      threatAction:(n,target)=>'Interromper a dispersão de volume e concentrar '+target+' spots em '+n+' até o score técnico estabilizar e a taxa de erro cair.',
      access:'Acesse PERFORMANCE para ver a SWOT desmembrada e comentada item por item e iniciar os treinos específicos indicados para sua evolução.'
    };
    const en={
      dim:{section:'topic',position:'position',street:'street',stack:'stack',phase:'phase',action:'action',training:'training'},
      weakComment:(d,n)=>'The pattern in '+d+' '+n+' is not consolidated yet. The issue is not only raw errors: errors, adjustable decisions and technical score together indicate recurring difficulty identifying the dominant line.',
      weakRisk:(d,n)=>'If this pattern continues, similar decisions in '+n+' can repeatedly lose EV and contaminate nearby scenarios.',
      weakAction:(n,target)=>'Run a focused '+target+'-spot session in '+n+', review every error and compare chosen action, indicated action and solver frequency before moving on.',
      oppComment:(n)=>n+' is in an intermediate zone: the base is good enough to improve quickly, but adjustable decisions show that mixes are not automated yet.',
      oppRisk:(n)=>'Without reinforcement, '+n+' may remain intuition-dependent and vary significantly between sessions.',
      oppAction:(n,target)=>'Run '+target+' reinforcement spots in '+n+', prioritizing mixed-frequency decisions.',
      strengthComment:(n)=>n+' is consistent in the current sample and can be used as a reference point for other parts of the game.',
      strengthRisk:(n)=>'The main risk in '+n+' is reducing review frequency and losing consistency over time.',
      strengthAction:(n)=>'Keep short maintenance sessions and gradually increase complexity.',
      threatTrend:(n,d)=>n+' has recently regressed by '+Math.abs(d).toFixed(1)+' percentage points in technical score.',
      threatErrors:(n,r)=>n+' contains '+r.toFixed(1)+'% incorrect decisions in the sample.',
      threatRisk:(n)=>'The combination of volume and weak performance turns '+n+' into a practical threat: the leak appears often enough to affect overall results.',
      threatAction:(n,target)=>'Stop spreading volume and focus '+target+' spots on '+n+' until technical score stabilizes and the error rate drops.',
      access:'Open PERFORMANCE to see the SWOT broken down and commented item by item and start the specific training prescribed for your evolution.'
    };
    const es={
      dim:{section:'tema',position:'posición',street:'street',stack:'stack',phase:'fase',action:'acción',training:'entreno'},
      weakComment:(d,n)=>'El patrón en '+d+' '+n+' aún no está consolidado. El problema no es solo el número bruto de errores: errores, decisiones ajustables y score técnico indican dificultad recurrente para reconocer la línea dominante.',
      weakRisk:(d,n)=>'Si este patrón continúa, decisiones similares en '+n+' pueden perder EV repetidamente y contaminar escenarios cercanos.',
      weakAction:(n,target)=>'Realizar una sesión dirigida de '+target+' spots en '+n+', revisar todos los errores y comparar acción elegida, acción indicada y frecuencia del solver.',
      oppComment:(n)=>n+' está en una zona intermedia: existe base para evolucionar rápido, pero las decisiones ajustables muestran que los mixes aún no están automatizados.',
      oppRisk:(n)=>'Sin refuerzo, '+n+' puede seguir dependiendo de intuición y variar demasiado entre sesiones.',
      oppAction:(n,target)=>'Realizar '+target+' spots de refuerzo en '+n+', priorizando decisiones de frecuencia mixta.',
      strengthComment:(n)=>n+' presenta rendimiento consistente en la muestra actual y puede servir de referencia para otras áreas.',
      strengthRisk:(n)=>'El principal riesgo en '+n+' es reducir la frecuencia de revisión y perder consistencia.',
      strengthAction:(n)=>'Mantener sesiones cortas de mantenimiento y aumentar gradualmente la complejidad.',
      threatTrend:(n,d)=>n+' presenta una regresión reciente de '+Math.abs(d).toFixed(1).replace('.',',')+' puntos porcentuales en score técnico.',
      threatErrors:(n,r)=>n+' concentra '+r.toFixed(1).replace('.',',')+'% de decisiones incorrectas.',
      threatRisk:(n)=>'La combinación de volumen y bajo rendimiento convierte '+n+' en una amenaza práctica: el leak aparece con frecuencia suficiente para afectar el resultado global.',
      threatAction:(n,target)=>'Dejar de dispersar volumen y concentrar '+target+' spots en '+n+' hasta estabilizar el score técnico y reducir la tasa de error.',
      access:'Accede a PERFORMANCE para ver la SWOT desglosada y comentada punto por punto e iniciar los entrenos específicos indicados para tu evolución.'
    };
    return lang==='en'?en:lang==='es'?es:pt;
  }
  function evidence(item){
    const c=item.counts,t=item.trend;
    const parts=[
      c.total+' spots',
      c.correct+' correct',
      c.adjustable+' adjustable',
      c.incorrect+' incorrect',
      'technical '+pct(c.technical),
      'error '+pct(c.incorrectRate)
    ];
    if(t.enough)parts.push('trend '+(t.delta>0?'+':'')+t.delta.toFixed(1)+' pp');
    return parts.join(' · ');
  }
  function severity(item){
    const c=item.counts,t=item.trend;
    return Math.max(0,Math.min(100,
      (65-c.technical)*1.2+
      c.incorrectRate*.65+
      c.adjustableRate*.25+
      (t.enough&&t.delta<0?Math.abs(t.delta)*1.1:0)+
      Math.min(12,c.total/4)
    ));
  }
  function makeItem(item,type,lang){
    const tx=langText(lang),c=item.counts,t=item.trend,sev=severity(item);
    const target=sev>=70?100:sev>=50?75:50;
    const dim=tx.dim[item.dimension]||item.dimension;
    let comment='',risk='',action='';
    if(type==='strength'){
      comment=tx.strengthComment(item.name);risk=tx.strengthRisk(item.name);action=tx.strengthAction(item.name);
    }else if(type==='opportunity'){
      comment=tx.oppComment(item.name);risk=tx.oppRisk(item.name);action=tx.oppAction(item.name,target);
    }else if(type==='threat'){
      comment=t.enough&&t.delta<=-5?tx.threatTrend(item.name,t.delta):tx.threatErrors(item.name,c.incorrectRate);
      risk=tx.threatRisk(item.name);action=tx.threatAction(item.name,target);
    }else{
      comment=tx.weakComment(dim,item.name);risk=tx.weakRisk(dim,item.name);action=tx.weakAction(item.name,target);
    }
    const id=[type,item.dimension,String(item.name).toLowerCase().replace(/\s+/g,'-')].join(':');
    return {
      id,type,dimension:item.dimension,name:item.name,severity:Math.round(sev),
      metrics:{...c,trendDelta:t.delta,trendEnough:t.enough},
      evidence:evidence(item),comment,risk,action,
      training:{
        externalKey:'performance:'+id,
        origin:'grinder',
        kind:type==='opportunity'?'reinforcement':'weakness',
        priority:sev>=70?'critical':sev>=50?'high':sev>=30?'medium':'normal',
        title:(type==='opportunity'?'REFORÇO':'CORREÇÃO')+' · '+item.name,
        reason:comment+' '+risk,
        targetSpots:target,
        filters:trainingFilters(item,target),
        meta:{prescriptionId:'performance:'+id,analysisId:id,severity:Math.round(sev),baselineScore:c.technical,confidence:Math.min(100,c.total*4),dimension:item.dimension}
      }
    };
  }
  let ANALYSIS_CACHE_KEY='';
  let ANALYSIS_CACHE_VALUE=null;
  function analysisKey(records,lang){
    const r=Array.isArray(records)?records:[];
    const first=r[0]||{},last=r[r.length-1]||{};
    return [lang||'pt',r.length,first.id||'',first.answeredAt||'',first.status||'',last.id||'',last.answeredAt||'',last.status||''].join('|');
  }
  function analyze(records,lang){
    const cacheKey=analysisKey(records,lang);
    if(cacheKey===ANALYSIS_CACHE_KEY&&ANALYSIS_CACHE_VALUE)return ANALYSIS_CACHE_VALUE;
    const all=[];
    ['section','position','street','stack','phase','action','training'].forEach(d=>all.push(...grouped(records,d)));
    const usable=all.filter(x=>x.counts.total>=6&&x.name&&x.name!=='N/D'&&x.name!=='null');
    const strengthRaw=usable.filter(x=>x.counts.total>=10&&x.counts.technical>=80&&x.counts.incorrectRate<20)
      .sort((a,b)=>b.counts.technical-a.counts.technical||b.counts.total-a.counts.total).slice(0,6);
    const weaknessRaw=usable.filter(x=>x.counts.technical<65||x.counts.incorrectRate>=30)
      .sort((a,b)=>severity(b)-severity(a)).slice(0,8);
    const weakIds=new Set(weaknessRaw.map(x=>x.dimension+'|'+x.name));
    const opportunityRaw=usable.filter(x=>!weakIds.has(x.dimension+'|'+x.name)&&(x.counts.technical<80||x.counts.adjustableRate>=25))
      .sort((a,b)=>b.counts.adjustableRate-a.counts.adjustableRate||a.counts.technical-b.counts.technical).slice(0,6);
    const threatRaw=usable.filter(x=>(x.trend.enough&&x.trend.delta<=-5)||x.counts.incorrectRate>=35||(x.counts.total>=20&&x.counts.technical<65))
      .sort((a,b)=>{
        const ar=(a.trend.enough&&a.trend.delta<0?Math.abs(a.trend.delta):0)+a.counts.incorrectRate;
        const br=(b.trend.enough&&b.trend.delta<0?Math.abs(b.trend.delta):0)+b.counts.incorrectRate;
        return br-ar;
      }).slice(0,8);
    const strengths=strengthRaw.map(x=>makeItem(x,'strength',lang));
    const weaknesses=weaknessRaw.map(x=>makeItem(x,'weakness',lang));
    const opportunities=opportunityRaw.map(x=>makeItem(x,'opportunity',lang));
    const threats=threatRaw.map(x=>makeItem(x,'threat',lang));
    const seen=new Set(),recommendations=[];
    [...weaknesses,...threats,...opportunities].forEach(x=>{
      const key=x.training.externalKey;
      if(seen.has(key))return;
      seen.add(key);recommendations.push(x.training);
    });
    ANALYSIS_CACHE_KEY=cacheKey;
    ANALYSIS_CACHE_VALUE={
      overall:counts(records),strengths,weaknesses,opportunities,threats,
      recommendations:recommendations.slice(0,10),
      accessMessage:langText(lang).access
    };
    return ANALYSIS_CACHE_VALUE;
  }

  global.StackUpPerformanceAnalysis=Object.freeze({analyze,counts,trend,grouped});
})(window);
