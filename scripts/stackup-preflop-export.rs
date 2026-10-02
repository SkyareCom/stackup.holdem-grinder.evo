use dcfr_solver::iso::CanonicalHand;
use dcfr_solver::preflop::{
    PreflopAction, PreflopBlueprint, PreflopNodeType, PreflopState,
    POSITION_NAMES, NUM_PLAYERS,
};
use serde::Serialize;
use std::collections::{BTreeSet, HashSet};
use std::fs::File;
use std::io::BufReader;
use std::env;

#[derive(Clone, Serialize)]
struct Event {
    position: String,
    action: String,
    kind: String,
    to: f32,
}

#[derive(Serialize)]
struct ActionProb {
    action: String,
    kind: String,
    frequency: f32,
    ev: Option<f32>,
}

#[derive(Serialize)]
struct HandStrategy {
    hand: String,
    actions: Vec<ActionProb>,
}

#[derive(Serialize)]
struct Scenario {
    gameType: String,
    street: String,
    tableSize: usize,
    heroPosition: String,
    villainPosition: Option<String>,
    heroStack: f32,
    effectiveStack: f32,
    pot: f32,
    currentBet: f32,
    board: Vec<String>,
    positions: Vec<String>,
    playerStacks: std::collections::BTreeMap<String, f32>,
    actionHistory: Vec<Event>,
    tags: Vec<String>,
    solverNode: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    phase: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tournamentType: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    fieldSize: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    opponentProfile: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    extras: Vec<String>,
    provenance: serde_json::Value,
}

#[derive(Serialize)]
struct Spot {
    id: String,
    solver: String,
    version: String,
    solveId: String,
    scenario: Scenario,
    strategy: Vec<HandStrategy>,
}

fn env_opt(name: &str) -> Option<String> {
    env::var(name).ok().map(|x| x.trim().to_string()).filter(|x| !x.is_empty())
}

fn solve_context_id() -> String {
    env_opt("STACKUP_SOLVE_CONTEXT_ID").unwrap_or_else(|| "default".to_string())
}

fn game_type() -> String {
    env_opt("STACKUP_GAME_TYPE").unwrap_or_else(|| "TOURNAMENT".to_string()).to_uppercase()
}

fn extra_tags() -> Vec<String> {
    env_opt("STACKUP_EXTRA_TAGS").unwrap_or_default()
        .split(',').map(|x| x.trim().to_string()).filter(|x| !x.is_empty()).collect()
}

fn extras() -> Vec<String> {
    env_opt("STACKUP_EXTRAS").unwrap_or_default()
        .split(',').map(|x| x.trim().to_string()).filter(|x| !x.is_empty()).collect()
}

fn slug(value: &str) -> String {
    value.chars().map(|ch| if ch.is_ascii_alphanumeric() { ch.to_ascii_lowercase() } else { '-' })
        .collect::<String>().split('-').filter(|x| !x.is_empty()).collect::<Vec<_>>().join("-")
}

fn action_kind(a: PreflopAction) -> &'static str {
    match a {
        PreflopAction::Fold => "fold",
        PreflopAction::Check => "check",
        PreflopAction::Call => "call",
        PreflopAction::Raise(_) => "raise",
        PreflopAction::AllIn => "jam",
    }
}

fn position_rank(pos: &str) -> i32 {
    match pos {
        "BTN" => 8,
        "CO" => 7,
        "HJ" => 6,
        "LJ" => 5,
        "UTG+2" => 4,
        "UTG+1" => 3,
        "UTG" => 2,
        "BB" => 1,
        "SB" => 0,
        _ => -1,
    }
}

fn relation(hero: &str, villain: &str) -> &'static str {
    if position_rank(hero) > position_rank(villain) { "ip" } else { "oop" }
}

fn active_positions(state: &PreflopState) -> Vec<usize> {
    (0..NUM_PLAYERS).filter(|&i| !state.folded[i]).collect()
}

fn semantic_tags(state: &PreflopState, events: &[Event]) -> Vec<String> {
    let hero = POSITION_NAMES[state.to_act as usize];
    let mut tags = BTreeSet::new();
    let raises: Vec<&Event> = events.iter().filter(|e| e.kind == "raise" || e.kind == "jam").collect();
    let opener = raises.first().map(|e| e.position.as_str());
    let last_raiser = raises.last().map(|e| e.position.as_str());
    let hero_previously_acted = events.iter().any(|e| e.position == hero);
    let calls_after_open = if let Some(first_raise_idx) = events.iter().position(|e| e.kind == "raise" || e.kind == "jam") {
        events.iter().skip(first_raise_idx + 1).filter(|e| e.kind == "call").count()
    } else { 0 };
    let facing = state.max_bet() > state.bets[state.to_act as usize];
    let actions = state.actions();
    let has_raise = actions.iter().any(|a| matches!(a, PreflopAction::Raise(_) | PreflopAction::AllIn));

    if NUM_PLAYERS == 2 {
        tags.insert("heads_up_2max".to_string());
        tags.insert("blind_war".to_string());
    } else if active_positions(state).iter().all(|&p| p >= NUM_PLAYERS.saturating_sub(2)) {
        tags.insert("blind_war".to_string());
    }
    if hero == "CO" || hero == "BTN" {
        tags.insert("cobtn".to_string());
    }

    if state.n_raises == 0 {
        if hero != "BB" {
            tags.insert("open_by_pos".to_string());
            if hero == "CO" || hero == "BTN" {
                tags.insert("attack_cobtn".to_string());
            }
        }
        // SB has a genuine limp/raise/fold strategy when folded to.
        if hero == "SB" && actions.iter().any(|a| matches!(a, PreflopAction::Call)) {
            tags.insert("limping".to_string());
        }

        // BB after SB limp.
        if hero == "BB" && events.last().map(|e| e.position.as_str()) == Some("SB")
            && events.last().map(|e| e.kind.as_str()) == Some("call") {
            tags.insert("bb_limpers".to_string());
            if has_raise { tags.insert("iso_limpers".to_string()); }
        }
    }

    if state.n_raises == 1 && facing {
        if let Some(open_pos) = opener {
            // A player who has not invested voluntarily is facing an open.
            if !hero_previously_acted {
                tags.insert(format!("vs_open_{}", relation(hero, open_pos)));
                tags.insert("cold_call".to_string());

                if hero == "BB" {
                    match open_pos {
                        "UTG" | "UTG+1" | "UTG+2" => { tags.insert("bb_ep".to_string()); },
                        "LJ" | "HJ" => { tags.insert("bb_mp".to_string()); },
                        "CO" | "BTN" | "SB" => { tags.insert("bb_lp".to_string()); },
                        _ => {}
                    }
                }
                if hero == "SB" {
                    match open_pos {
                        "UTG" | "UTG+1" | "UTG+2" => { tags.insert("sb_ep".to_string()); },
                        "LJ" | "HJ" => { tags.insert("sb_mp".to_string()); },
                        "CO" | "BTN" => { tags.insert("sb_cobtn".to_string()); },
                        _ => {}
                    }
                }
                if (hero == "CO" || hero == "BTN") && open_pos != hero {
                    tags.insert("cobtn_vs_raise".to_string());
                }

                if has_raise {
                    tags.insert(format!("3bet_{}", relation(hero, open_pos)));
                }
                if calls_after_open > 0 && has_raise {
                    tags.insert("squeeze".to_string());
                }
            }

            // SB limped, BB raised, action returned to SB.
            if hero == "SB" && hero_previously_acted
                && events.iter().any(|e| e.position == "SB" && e.kind == "call")
                && last_raiser == Some("BB") {
                tags.insert("sb_limp_call".to_string());
                if has_raise {
                    tags.insert("sb_limp_raise".to_string());
                    tags.insert("limp_raise".to_string());
                }
            }
        }
    }

    if state.n_raises == 2 && facing {
        if let Some(open_pos) = opener {
            if hero == open_pos {
                // Original opener now has the full fold/call/4bet decision.
                tags.insert("raise_vs_3bet".to_string());
                tags.insert("call_3bet".to_string());
                tags.insert("fold_to_3bet".to_string());
            } else if !hero_previously_acted {
                // A third player facing open + 3bet: cold call / cold 4bet node.
                tags.insert("cold_call_4bet".to_string());
                if has_raise { tags.insert("cold_4bet".to_string()); }
            }
        }
    }

    if state.n_raises >= 3 && facing {
        if let Some(last) = last_raiser {
            if hero != last {
                tags.insert("facing_4bet".to_string());
                tags.insert("call_4bet".to_string());
            }
        }
    }

    tags.into_iter().collect()
}

fn strategy_at(bp: &PreflopBlueprint, state: &PreflopState, history: &[u8]) -> Vec<HandStrategy> {
    let actions = state.actions();
    let mut out = Vec::with_capacity(169);
    for idx in 0..169u8 {
        let key = dcfr_solver::preflop::PreflopInfoKey { bucket: idx, history: history.to_vec() };
        let Some(entry) = bp.entries.get(&key) else { continue; };
        if !entry.cum_strategy.iter().any(|x| *x > 0.0) { continue; }
        let probs = entry.average_strategy();
        if probs.len()!=actions.len() { continue; }
        let total:f32=probs.iter().sum();
        if !total.is_finite() || total<=0.0 { continue; }

        let ch = CanonicalHand::from_index(idx).to_string();
        let mut hs = Vec::with_capacity(actions.len());
        for (i, action) in actions.iter().enumerate() {
            let p=(probs[i]/total).max(0.0);
            hs.push(ActionProb {
                action: action.to_string(),
                kind: action_kind(*action).to_string(),
                frequency: p * 100.0,
                ev: None,
            });
        }
        out.push(HandStrategy { hand: ch, actions: hs });
    }
    out
}

fn node_supported(bp: &PreflopBlueprint, history: &[u8]) -> bool {
    (0..169u8).any(|idx| {
        let key = dcfr_solver::preflop::PreflopInfoKey { bucket: idx, history: history.to_vec() };
        bp.entries.get(&key).map(|e| e.cum_strategy.iter().any(|x| *x > 0.0)).unwrap_or(false)
    })
}

fn branch_supported(bp: &PreflopBlueprint, history: &[u8], action_idx: usize) -> bool {
    (0..169u8).any(|idx| {
        let key = dcfr_solver::preflop::PreflopInfoKey { bucket: idx, history: history.to_vec() };
        bp.entries.get(&key)
            .map(|e| e.average_strategy().get(action_idx).copied().unwrap_or(0.0) > 0.0005)
            .unwrap_or(false)
    })
}

fn walk(
    bp: &PreflopBlueprint,
    state: PreflopState,
    history: &mut Vec<u8>,
    events: &mut Vec<Event>,
    seen: &mut HashSet<Vec<u8>>,
    spots: &mut Vec<Spot>,
) {
    if history.len() > 24 { return; }
    if !matches!(state.node_type(), PreflopNodeType::Decision(_)) { return; }
    if !seen.insert(history.clone()) { return; }
    if !node_supported(bp, history) { return; }

    let hero_idx = state.to_act as usize;
    let hero = POSITION_NAMES[hero_idx].to_string();
    let active = active_positions(&state);
    let villain = active.iter().copied().filter(|&p| p != hero_idx)
        .max_by_key(|&p| position_rank(POSITION_NAMES[p]))
        .map(|p| POSITION_NAMES[p].to_string());
    let mut tags = semantic_tags(&state, events);
    tags.extend(extra_tags());
    tags.sort();
    tags.dedup();
    let strategy = strategy_at(bp, &state, history);

    if !strategy.is_empty() && !tags.is_empty() {
        let pot = state.bets.iter().sum::<i32>() as f32 / 2.0;
        let current_bet = state.max_bet() as f32 / 2.0;
        let hero_total = (state.stacks[hero_idx] + state.bets[hero_idx]) as f32 / 2.0;
        let mut eff = hero_total;
        for &p in &active {
            if p == hero_idx { continue; }
            let total = (state.stacks[p] + state.bets[p]) as f32 / 2.0;
            eff = eff.min(total);
        }
        let mut player_stacks = std::collections::BTreeMap::new();
        for p in 0..NUM_PLAYERS {
            player_stacks.insert(POSITION_NAMES[p].to_string(), state.stacks[p] as f32 / 2.0);
        }
        let node_id = if history.is_empty() { "root".to_string() }
            else { history.iter().map(|x| x.to_string()).collect::<Vec<_>>().join("-") };
        let context = solve_context_id();
        let context_slug = slug(&context);
        let id = format!("dcfr-preflop-{}-node-{}", context_slug, node_id);
        spots.push(Spot {
            id: id.clone(),
            solver: "DCFR_SOLVER".to_string(),
            version: "preflop-blueprint-v2-contextual".to_string(),
            solveId: format!("preflop-blueprint|{}|{}", context, node_id),
            scenario: Scenario {
                gameType: game_type(),
                street: "PRE-FLOP".to_string(),
                tableSize: NUM_PLAYERS,
                heroPosition: hero,
                villainPosition: villain,
                heroStack: hero_total,
                effectiveStack: eff,
                pot,
                currentBet: current_bet,
                board: vec![],
                positions: POSITION_NAMES.iter().map(|x| x.to_string()).collect(),
                playerStacks: player_stacks,
                actionHistory: events.clone(),
                tags,
                solverNode: node_id,
                phase: env_opt("STACKUP_PHASE").map(|x| x.to_uppercase()),
                tournamentType: env_opt("STACKUP_TOURNAMENT_TYPE").map(|x| x.to_uppercase()),
                fieldSize: env_opt("STACKUP_FIELD_SIZE"),
                opponentProfile: env_opt("STACKUP_OPPONENT_PROFILE"),
                extras: extras(),
                provenance: serde_json::json!({
                    "strategySource":"DCFR_PREFLOP_BLUEPRINT",
                    "upstream":"exinori/DCFR-SOLVER",
                    "license":"MIT",
                    "iterations":bp.iterations,
                    "solveContextId":context,
                    "gameType":game_type(),
                    "phase":env_opt("STACKUP_PHASE"),
                    "tournamentType":env_opt("STACKUP_TOURNAMENT_TYPE"),
                    "fieldSize":env_opt("STACKUP_FIELD_SIZE"),
                    "opponentProfile":env_opt("STACKUP_OPPONENT_PROFILE"),
                    "extras":extras()
                }),
            },
            strategy,
        });
    }

    let actor = state.to_act as usize;
    let actions = state.actions();
    for (idx, action) in actions.iter().copied().enumerate() {
        if !branch_supported(bp, history, idx) { continue; }
        let next = state.apply(action);
        let to = next.bets[actor] as f32 / 2.0;
        history.push(idx as u8);
        events.push(Event {
            position: POSITION_NAMES[actor].to_string(),
            action: action.to_string(),
            kind: action_kind(action).to_string(),
            to,
        });
        walk(bp, next, history, events, seen, spots);
        events.pop();
        history.pop();
    }
}


fn combo_count(hand: &str) -> usize {
    if hand.len() < 2 { return 0; }
    let chars: Vec<char> = hand.chars().collect();
    if chars[0] == chars[1] { return 6; }
    if hand.ends_with('s') { return 4; }
    if hand.ends_with('o') { return 12; }
    0
}

fn spot_combo_count(spot: &Spot) -> usize {
    spot.strategy.iter().map(|h| combo_count(&h.hand)).sum()
}

fn target_tags() -> HashSet<&'static str> {
    [
        "limping","bb_ep","bb_mp","bb_lp","sb_ep","sb_mp","sb_cobtn",
        "attack_cobtn","cobtn_vs_raise","cobtn","open_by_pos","vs_open_ip",
        "vs_open_oop","cold_call","blind_war","bb_limpers","sb_limp_call",
        "sb_limp_raise","iso_limpers","limp_raise","squeeze","facing_4bet",
        "cold_call_4bet","raise_vs_3bet","3bet_ip","3bet_oop","call_3bet",
        "fold_to_3bet","call_4bet","cold_4bet","heads_up_2max"
    ].into_iter().collect()
}

fn compact_for_training(spots: Vec<Spot>) -> (Vec<Spot>, serde_json::Value) {
    const TARGET_PER_TAG: usize = 2200;
    const MAX_NODES_PER_TAG: usize = 8;

    let targets = target_tags();
    let mut tag_to_indices: std::collections::BTreeMap<String, Vec<usize>> = std::collections::BTreeMap::new();
    for (idx, spot) in spots.iter().enumerate() {
        for tag in &spot.scenario.tags {
            if targets.contains(tag.as_str()) {
                tag_to_indices.entry(tag.clone()).or_default().push(idx);
            }
        }
    }

    for indices in tag_to_indices.values_mut() {
        indices.sort_by_key(|&i| std::cmp::Reverse(spot_combo_count(&spots[i])));
    }

    let mut selected = BTreeSet::new();
    let mut report = serde_json::Map::new();

    for tag in targets.iter() {
        let mut covered = 0usize;
        let mut nodes = 0usize;
        if let Some(indices) = tag_to_indices.get(*tag) {
            for &idx in indices {
                if nodes >= MAX_NODES_PER_TAG || covered >= TARGET_PER_TAG { break; }
                let count = spot_combo_count(&spots[idx]);
                if count == 0 { continue; }
                selected.insert(idx);
                covered += count;
                nodes += 1;
            }
        }
        report.insert((*tag).to_string(), serde_json::json!({
            "candidateCombos": covered,
            "selectedNodes": nodes,
            "target": TARGET_PER_TAG
        }));
    }

    // Keep a small, diverse RFI backbone even when another bank already contains root charts.
    // These nodes are useful as cross-checks and do not materially increase bundle size.
    let mut rfi_by_pos: std::collections::BTreeMap<String, usize> = std::collections::BTreeMap::new();
    for (idx, spot) in spots.iter().enumerate() {
        if !spot.scenario.tags.iter().any(|t| t=="open_by_pos") { continue; }
        let pos=spot.scenario.heroPosition.clone();
        let count=spot_combo_count(spot);
        let replace=rfi_by_pos.get(&pos).map(|&old| count>spot_combo_count(&spots[old])).unwrap_or(true);
        if replace { rfi_by_pos.insert(pos,idx); }
    }
    for idx in rfi_by_pos.values() { selected.insert(*idx); }

    let compact: Vec<Spot> = spots.into_iter().enumerate()
        .filter_map(|(idx,spot)| if selected.contains(&idx) { Some(spot) } else { None })
        .collect();

    (compact, serde_json::Value::Object(report))
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() != 3 {
        eprintln!("usage: stackup_preflop_export <blueprint.bin> <output.json>");
        std::process::exit(2);
    }
    let mut reader = BufReader::new(File::open(&args[1])?);
    let bp = PreflopBlueprint::load(&mut reader)?;
    let root = PreflopState::new_6max(bp.config.clone());
    let mut spots = Vec::new();
    let mut history = Vec::new();
    let mut events = Vec::new();
    let mut seen = HashSet::new();
    walk(&bp, root, &mut history, &mut events, &mut seen, &mut spots);
    let raw_nodes = spots.len();
    let (spots, coverage_report) = compact_for_training(spots);

    let payload = serde_json::json!({
        "schemaVersion":1,
        "solver":"DCFR_SOLVER",
        "upstream":{
            "repository":"exinori/DCFR-SOLVER",
            "commit":"4ade6a9e15a841c41867afde1258b9d110cd6fb1",
            "license":"MIT"
        },
        "iterations":bp.iterations,
        "rawDecisionNodes":raw_nodes,
        "publishedDecisionNodes":spots.len(),
        "selectionTargetCombosPerTag":2200,
        "coverageReport":coverage_report,
        "spots":spots
    });
    std::fs::write(&args[2], serde_json::to_vec(&payload)?)?;
    eprintln!("exported {} preflop decision nodes", payload["spots"].as_array().map(|x| x.len()).unwrap_or(0));
    Ok(())
}
