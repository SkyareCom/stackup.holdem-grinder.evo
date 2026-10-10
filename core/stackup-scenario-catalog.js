/* STACKUP HOLD'EM — Scenario Catalog V1
   Every training card is an independent scenario contract.
   A card is publishable only when it exposes >= MIN_SPOTS validated unique spots.
   AI may propose realistic scenario parameters, but cannot certify strategy by itself. */
(function(global){
  'use strict';

  const MIN_SPOTS=1500;

  const SOURCE=Object.freeze({
    DCFR:'DCFR_EXACT',
    TEXAS:'TEXAS_CALIBRATED',
    ICM:'ICM_MATH',
    PKO:'PKO_MATH',
    MATH:'POKER_MATH',
    AI_SOLVER:'AI_PLUS_SOLVER',
    UNSUPPORTED:'UNAVAILABLE'
  });

  const def=(section,id,label,source,validator,extra={})=>Object.freeze({
    section,id,label,minSpots:MIN_SPOTS,source,validator,...extra
  });

  const ADJUST=[
    def('mode','cash','CASH GAME',SOURCE.AI_SOLVER,'cash_range_solver'),
    def('mode','mtt','TORNEIO',SOURCE.DCFR,'tournament_solver'),
    ...['s2','s6','s8','s9','s10'].map(id=>def('seats',id,id.toUpperCase(),SOURCE.AI_SOLVER,'table_size_ranges',{tableSize:Number(id.slice(1))})),
    ...['regular','turbo','pko','freeze','hroller','sng'].map(id=>def('ttype',id,id.toUpperCase(),id==='pko'?SOURCE.PKO:SOURCE.AI_SOLVER,'tournament_format')),
    ...['rebuy','addon'].map(id=>def('extras',id,id.toUpperCase(),SOURCE.AI_SOLVER,'tournament_extra')),
    ...['50','100','250','350','500','1000+'].map(id=>def('fsize',id,'FIELD '+id,SOURCE.AI_SOLVER,'field_population_model')),
    ...['opp50','opp60','opp75','opp40'].map(id=>def('fskill',id,id.toUpperCase(),SOURCE.AI_SOLVER,'opponent_range_model')),
    ...['100','250','350','500','1000','2000'].map(id=>def('hands',id,id+' SPOTS',SOURCE.MATH,'sample_controller',{sessionTarget:Number(id)})),
    ...['early','middle','bubble','late','ft'].map(id=>def('phase',id,id.toUpperCase(),['bubble','ft'].includes(id)?SOURCE.ICM:SOURCE.AI_SOLVER,'phase_stack_icm_model')),
    ...['SB','BB','UTG','UTG+1','UTG+2','LJ','HJ','CO','BTN'].map(id=>def('pos',id,id,SOURCE.DCFR,'position_range_solver')),
    ...['pre','flop','turn','river'].map(id=>def('street',id,id.toUpperCase(),SOURCE.DCFR,'street_solver')),
    ...['5bb','10bb','15bb','18bb','20bb','25bb','30bb','50bb','100bb'].map(id=>def('stack',id,id.toUpperCase(),Number(id.replace('bb',''))<=25?SOURCE.ICM:SOURCE.AI_SOLVER,'effective_stack_solver',{stackBb:Number(id.replace('bb',''))}))
  ];

  const A=(section,id,label,source,validator,extra={})=>def(section,id,label,source,validator,extra);
  const ADVANCE=[
    A('pre_special','limping','LIMPING',SOURCE.AI_SOLVER,'preflop_limp_ranges'),
    A('pre_special','bb_ep','BB × EP',SOURCE.AI_SOLVER,'bb_vs_open',{hero:'BB',villainGroup:'EP'}),
    A('pre_special','bb_mp','BB × MP',SOURCE.AI_SOLVER,'bb_vs_open',{hero:'BB',villainGroup:'MP'}),
    A('pre_special','bb_lp','BB × LP',SOURCE.AI_SOLVER,'bb_vs_open',{hero:'BB',villainGroup:'LP'}),
    A('pre_special','sb_ep','SB × EP',SOURCE.AI_SOLVER,'sb_vs_open',{hero:'SB',villainGroup:'EP'}),
    A('pre_special','sb_mp','SB × MP',SOURCE.AI_SOLVER,'sb_vs_open',{hero:'SB',villainGroup:'MP'}),
    A('pre_special','sb_cobtn','SB × CO/BTN',SOURCE.AI_SOLVER,'sb_vs_open',{hero:'SB',villainGroup:'LP'}),
    A('pre_special','attack_cobtn','ATAQUE CO/BTN',SOURCE.DCFR,'late_position_rfi'),
    A('pre_special','cobtn_vs_raise','CO/BTN VS RAISE',SOURCE.AI_SOLVER,'ip_vs_open'),
    A('pre_special','cobtn','CO / BTN',SOURCE.AI_SOLVER,'late_position_play'),
    A('pre_special','open_by_pos','OPEN POR POSIÇÃO',SOURCE.DCFR,'rfi_chart'),
    A('pre_special','vs_open_ip','VS OPEN IP',SOURCE.AI_SOLVER,'ip_vs_open'),
    A('pre_special','vs_open_oop','VS OPEN OOP',SOURCE.AI_SOLVER,'oop_vs_open'),
    A('pre_special','cold_call','COLD CALL',SOURCE.AI_SOLVER,'cold_call_ranges'),

    A('blind_special','blind_war','BLIND WAR',SOURCE.AI_SOLVER,'sb_bb_war'),
    A('blind_special','bb_limpers','BB × LIMPERS',SOURCE.AI_SOLVER,'bb_vs_limpers'),
    A('blind_special','sb_limp_call','SB LIMP-CALL',SOURCE.AI_SOLVER,'sb_limp_call'),
    A('blind_special','sb_limp_raise','SB LIMP-RAISE',SOURCE.AI_SOLVER,'sb_limp_raise'),
    A('blind_special','iso_limpers','ISO LIMPERS',SOURCE.AI_SOLVER,'isolate_limpers'),
    A('blind_special','limp_raise','LIMP-RAISE',SOURCE.AI_SOLVER,'limp_raise'),
    A('blind_special','heads_up_2max','HEADS-UP 2-MAX',SOURCE.AI_SOLVER,'hu_ranges',{tableSize:2}),

    A('aggr_special','squeeze','SQUEEZE',SOURCE.AI_SOLVER,'squeeze_ranges'),
    A('aggr_special','facing_4bet','FACING 4-BET',SOURCE.AI_SOLVER,'facing_4bet'),
    A('aggr_special','cold_call_4bet','COLD CALL / 4-BET',SOURCE.AI_SOLVER,'cold_action'),
    A('aggr_special','pot_4bet','POTE 4-BET',SOURCE.DCFR,'fourbet_postflop'),
    A('aggr_special','raise_vs_3bet','RAISE VS 3-BET',SOURCE.AI_SOLVER,'facing_3bet'),
    A('aggr_special','3bet_ip','3-BET IP',SOURCE.AI_SOLVER,'threebet_ip'),
    A('aggr_special','3bet_oop','3-BET OOP',SOURCE.AI_SOLVER,'threebet_oop'),
    A('aggr_special','call_3bet','CALL 3-BET',SOURCE.AI_SOLVER,'call_3bet'),
    A('aggr_special','fold_to_3bet','FOLD TO 3-BET',SOURCE.AI_SOLVER,'fold_to_3bet'),
    A('aggr_special','4bet_bluff','4-BET BLUFF',SOURCE.AI_SOLVER,'fourbet_bluff'),
    A('aggr_special','4bet_value','4-BET VALUE',SOURCE.AI_SOLVER,'fourbet_value'),
    A('aggr_special','call_4bet','CALL 4-BET',SOURCE.AI_SOLVER,'call_4bet'),
    A('aggr_special','cold_4bet','COLD 4-BET',SOURCE.AI_SOLVER,'cold_4bet'),

    A('short_special','chip_up','CHIP UP',SOURCE.AI_SOLVER,'early_accumulation'),
    A('short_special','open_shove','OPEN SHOVE',SOURCE.ICM,'push_fold_open'),
    A('short_special','call_shove','CALL SHOVE',SOURCE.ICM,'push_fold_call'),
    A('short_special','reshove','RESHOVE',SOURCE.ICM,'reshove'),
    A('short_special','multi_shove','MULTI SHOVE',SOURCE.ICM,'multi_shove'),
    A('short_special','push_fold','PUSH/FOLD',SOURCE.ICM,'push_fold'),

    ...[
      ['icm_5_8','ICM 5–8 BB','stack_5_8'],['icm_9_12','ICM 9–12 BB','stack_9_12'],
      ['icm_13_18','ICM 13–18 BB','stack_13_18'],['icm_19_25','ICM 19–25 BB','stack_19_25'],
      ['icm_bubble','ICM BUBBLE','bubble'],['icm_pay_jump','ICM PAY JUMP','pay_jump'],
      ['icm_final_table','ICM FINAL TABLE','final_table'],['icm_3handed','ICM 3-HANDED','three_handed'],
      ['big_stack_pressure','BIG STACK PRESSURE','big_stack'],['mid_stack_pressure','MID STACK PRESSURE','mid_stack'],
      ['short_stack_survival','SHORT STACK SURVIVAL','short_stack']
    ].map(([id,label,kind])=>A('icm_special',id,label,SOURCE.ICM,'icm_equity_solver',{icmKind:kind})),

    ...[
      ['pko_math','PKO MATEMÁTICO','math'],['bounty_call','BOUNTY CALL','call'],
      ['bounty_shove','BOUNTY SHOVE','shove'],['bounty_iso','BOUNTY ISO','iso'],
      ['covering_stack','COVERING STACK','covering'],['covered_stack','COVERED STACK','covered'],
      ['multiway_bounty','MULTIWAY BOUNTY','multiway']
    ].map(([id,label,kind])=>A('pko_special',id,label,SOURCE.PKO,'pko_equity_solver',{pkoKind:kind})),

    ...[
      ['postflop_multiway','PÓS-FLOP MULTIWAY','multiway'],['check_raise','CHECK-RAISE','check_raise'],
      ['sequential_lines','LINHAS SEQUENCIAIS','sequential'],['donk_bet','DONK BET','donk'],
      ['delayed_cbet','DELAYED C-BET','delayed_cbet'],['probe_bet','PROBE BET','probe'],
      ['check_back_flop','CHECK-BACK FLOP','check_back'],['double_barrel','DOUBLE BARREL','double_barrel'],
      ['triple_barrel','TRIPLE BARREL','triple_barrel'],['turn_check_raise','TURN CHECK-RAISE','turn_check_raise'],
      ['float_flop','FLOAT FLOP','float'],['miss_cbet','MISS C-BET','miss_cbet'],['vs_missed_cbet','VS MISSED C-BET','vs_missed_cbet']
    ].map(([id,label,line])=>A('post_special',id,label,SOURCE.DCFR,'solver_tree_node',{line})),

    ...[
      ['river_bluff_catch','RIVER BLUFF CATCH','bluff_catch'],['vs_overbet','VS OVERBET','overbet_response'],
      ['block_bet_20_25','BLOCK BET 20–25%','block_bet'],['river_check_raise','RIVER CHECK-RAISE','check_raise'],
      ['bet_fold','BET/FOLD','bet_fold'],['thin_value','THIN VALUE','thin_value'],['value_river','VALUE RIVER','value']
    ].map(([id,label,line])=>A('river_special',id,label,SOURCE.DCFR,'river_solver_node',{line,street:'RIVER'})),

    ...[
      ['board_dry','DRY BOARD','dry'],['board_connected','CONNECTED BOARD','connected'],
      ['board_paired','PAIRED BOARD','paired'],['board_monotone','MONOTONE BOARD','monotone'],
      ['board_twotone','TWO-TONE BOARD','twotone'],['board_high_card','HIGH-CARD BOARD','high_card'],
      ['board_low','LOW BOARD','low'],['board_dynamic','DYNAMIC BOARD','dynamic'],['board_static','STATIC BOARD','static']
    ].map(([id,label,texture])=>A('texture_special',id,label,SOURCE.DCFR,'board_texture',{texture})),
    ...[
      ['bet_25','BET 25%',.25],['bet_33','BET 33%',.33],['bet_50','BET 50%',.50],
      ['bet_66','BET 66%',.66],['bet_75','BET 75%',.75],['pot_bet','POT BET',1],
      ['overbet_125','OVERBET 125%',1.25],['overbet_150','OVERBET 150%',1.5]
    ].map(([id,label,sizing])=>A('texture_special',id,label,SOURCE.DCFR,'solver_sizing',{sizing})),

    ...[
      ['pot_odds','POT ODDS','pot_odds'],['implied_odds','IMPLIED ODDS','implied_odds'],
      ['reverse_implied_odds','REVERSE IMPLIED ODDS','reverse_implied_odds'],['mdf','MDF','mdf'],
      ['breakeven_bluff','BREAK-EVEN BLUFF','breakeven_bluff'],['breakeven_call','BREAK-EVEN CALL','breakeven_call'],
      ['combos','COMBOS','combos'],['blockers','BLOCKERS','blockers'],['equity_realization','EQUITY REALIZATION','equity_realization']
    ].map(([id,label,focus])=>A('math_special',id,label,SOURCE.MATH,'math_focus',{focus})),
    // Additional real poker decision families. Catalogued only: no synthetic solver certification.
    ...[
      ['straddle_pot','STRADDLE POT','straddle_pot'],
      ['ante_cash','CASH GAME COM ANTE','ante_cash'],
      ['bomb_pot','BOMB POT','bomb_pot'],
      ['dead_blind','DEAD BLIND','dead_blind'],
      ['mississippi_straddle','MISSISSIPPI STRADDLE','mississippi_straddle']
    ].map(([id,label,kind])=>A('game_special',id,label,SOURCE.UNSUPPORTED,'requires_specific_game_tree',{kind})),
    ...[
      ['heads_up_postflop','HEADS-UP PÓS-FLOP','heads_up_postflop'],
      ['three_way_pot','POTE 3-WAY','three_way'],
      ['four_way_plus','POTE 4-WAY+','four_way_plus'],
      ['side_pot','SIDE POT','side_pot'],
      ['dry_side_pot','DRY SIDE POT','dry_side_pot'],
      ['multi_all_in','MULTIWAY ALL-IN','multi_all_in'],
      ['effective_stack_asymmetry','STACKS ASSIMÉTRICOS','effective_stack_asymmetry']
    ].map(([id,label,kind])=>A('pot_special',id,label,SOURCE.UNSUPPORTED,'requires_multi_player_solver',{kind})),
    ...[
      ['overlimp','OVERLIMP','overlimp'],
      ['isolation_raise','ISOLATION RAISE','isolation_raise'],
      ['open_4bet','OPEN 4-BET','open_4bet'],
      ['five_bet','5-BET','five_bet'],
      ['five_bet_shove','5-BET SHOVE','five_bet_shove'],
      ['backraise','BACKRAISE','backraise'],
      ['cold_3bet','COLD 3-BET','cold_3bet']
    ].map(([id,label,kind])=>A('pre_extended',id,label,SOURCE.UNSUPPORTED,'requires_preflop_tree',{kind})),
    ...[
      ['flop_cbet','FLOP C-BET','flop_cbet'],
      ['flop_check_call','FLOP CHECK-CALL','flop_check_call'],
      ['turn_lead','TURN LEAD','turn_lead'],
      ['turn_overbet','TURN OVERBET','turn_overbet'],
      ['river_overbet','RIVER OVERBET','river_overbet'],
      ['river_triple_barrel_defense','DEFESA VS TRIPLE BARREL','river_triple_barrel_defense'],
      ['river_check_call','RIVER CHECK-CALL','river_check_call'],
      ['river_check_fold','RIVER CHECK-FOLD','river_check_fold']
    ].map(([id,label,kind])=>A('line_extended',id,label,SOURCE.UNSUPPORTED,'requires_action_history_solver',{kind})),
    ...[
      ['run_it_twice','RUN IT TWICE','run_it_twice'],
      ['satellite_bubble','SATELLITE BUBBLE','satellite_bubble'],
      ['final_table_deal','FINAL TABLE DEAL','final_table_deal'],
      ['mystery_bounty','MYSTERY BOUNTY','mystery_bounty'],
      ['progressive_bounty','PROGRESSIVE BOUNTY','progressive_bounty']
    ].map(([id,label,kind])=>A('format_extended',id,label,SOURCE.UNSUPPORTED,'requires_format_specific_model',{kind})),
  ];

  const ALL=Object.freeze([...ADJUST,...ADVANCE]);
  const byKey=new Map(ALL.map(x=>[x.section+':'+x.id,x]));

  function get(section,id){return byKey.get(section+':'+id)||null;}
  function count(){return Object.freeze({adjust:ADJUST.length,advance:ADVANCE.length,total:ALL.length});}
  function publishable(count){return Number(count)>=MIN_SPOTS;}
  function audit(counts={}){
    return ALL.map(item=>{
      const available=Number(counts[item.section+':'+item.id]||0);
      return Object.freeze({...item,available,publishable:publishable(available)});
    });
  }

  global.StackUpScenarioCatalog=Object.freeze({
    MIN_SPOTS,SOURCE,ADJUST:Object.freeze(ADJUST),ADVANCE:Object.freeze(ADVANCE),ALL,get,count,publishable,audit
  });
})(window);
