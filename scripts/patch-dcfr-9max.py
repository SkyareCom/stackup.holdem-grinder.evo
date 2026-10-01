#!/usr/bin/env python3
from pathlib import Path
import re, sys

if len(sys.argv)!=2:
    raise SystemExit("usage: patch-dcfr-9max.py <src/preflop.rs>")

path=Path(sys.argv[1])
s=path.read_text(encoding="utf-8")
original=s

def sub_once(pattern,repl,label,flags=0):
    global s
    s2,n=re.subn(pattern,repl,s,count=1,flags=flags)
    if n!=1:
        raise SystemExit(f"9max patch failed at {label}: matches={n}")
    s=s2

# Compile-time player count and position order.
sub_once(
    r'pub const NUM_PLAYERS: usize = 6;\s*pub const POSITION_NAMES: \[&str; 6\] = \["UTG", "HJ", "CO", "BTN", "SB", "BB"\];',
    'pub const NUM_PLAYERS: usize = 9;\npub const POSITION_NAMES: [&str; 9] = ["UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO", "BTN", "SB", "BB"];',
    "constants"
)

# Full-ring initializer. Keep public method name to avoid touching trainer API.
sub_once(
    r'pub fn new_6max\(config: PreflopBetConfig\) -> Self \{.*?\n    \}\n\n    /// Heads-up',
'''pub fn new_6max(config: PreflopBetConfig) -> Self {
        let mut stacks = [200; NUM_PLAYERS]; // 100bb = 200 chips
        let mut bets = [0i32; NUM_PLAYERS];
        let sb = NUM_PLAYERS - 2;
        let bb = NUM_PLAYERS - 1;
        stacks[sb] -= 1; // SB posts 1 chip (0.5bb)
        stacks[bb] -= 2; // BB posts 2 chips (1bb)
        bets[sb] = 1;
        bets[bb] = 2;

        PreflopState {
            stacks,
            bets,
            folded: [false; NUM_PLAYERS],
            has_acted: [false; NUM_PLAYERS],
            all_in: [false; NUM_PLAYERS],
            to_act: 0, // UTG acts first
            n_raises: 0,
            holes: [Hand::new(); NUM_PLAYERS],
            config,
            last_raise_size: 2,
        }
    }

    /// Heads-up''',
    "full-ring initializer",
    re.S
)

# HU initializer must also be array-size agnostic so the crate compiles.
sub_once(
    r'pub fn new_heads_up\(config: PreflopBetConfig\) -> Self \{.*?\n    \}\n\n    pub fn active_count',
'''pub fn new_heads_up(config: PreflopBetConfig) -> Self {
        let mut stacks = [0i32; NUM_PLAYERS];
        let mut bets = [0i32; NUM_PLAYERS];
        let mut folded = [true; NUM_PLAYERS];
        let mut has_acted = [true; NUM_PLAYERS];
        let sb = NUM_PLAYERS - 2;
        let bb = NUM_PLAYERS - 1;
        stacks[sb] = 200 - 1;
        stacks[bb] = 200 - 2;
        bets[sb] = 1;
        bets[bb] = 2;
        folded[sb] = false;
        folded[bb] = false;
        has_acted[sb] = false;
        has_acted[bb] = false;

        PreflopState {
            stacks,
            bets,
            folded,
            has_acted,
            all_in: [false; NUM_PLAYERS],
            to_act: sb as u8,
            n_raises: 0,
            holes: [Hand::new(); NUM_PLAYERS],
            config,
            last_raise_size: 2,
        }
    }

    pub fn active_count''',
    "heads-up initializer",
    re.S
)

# SB-specific action rules.
s=s.replace('(p == 4 && self.config.sb_limp)','(p == NUM_PLAYERS - 2 && self.config.sb_limp)')
s=s.replace('depth == 0 && p == 4','depth == 0 && p == NUM_PLAYERS - 2')

# RFI chart extraction should cover every non-blind position if used.
s=s.replace('for pos in 0..4 {','for pos in 0..(NUM_PLAYERS - 2) {')

# HU training helper: make blind indices dynamic even though this workflow does not call train_hu.
s=s.replace(
'''            state.holes[4] = Hand::new().add(c1).add(c2);
            state.holes[5] = Hand::new().add(c3).add(c4);

            // Traverser alternates SB(4) and BB(5)
            let traverser = if i % 2 == 0 { 4 } else { 5 };''',
'''            let sb = NUM_PLAYERS - 2;
            let bb = NUM_PLAYERS - 1;
            state.holes[sb] = Hand::new().add(c1).add(c2);
            state.holes[bb] = Hand::new().add(c3).add(c4);

            // Traverser alternates SB and BB.
            let traverser = if i % 2 == 0 { sb as u8 } else { bb as u8 };'''
)

# Heads-up postflop positional tax: generic ordering.
sub_once(
    r'let postflop_rank = \|p: usize\| -> usize \{\s*match p \{.*?\n\s*\}\s*\};\s*let \(ip, oop\)',
'''let postflop_rank = |p: usize| -> usize {
                        let sb = NUM_PLAYERS - 2;
                        let bb = NUM_PLAYERS - 1;
                        if p == sb {
                            0
                        } else if p == bb {
                            1
                        } else {
                            // Non-blind positions act after blinds postflop in
                            // their natural order; BTN is therefore highest.
                            p + 2
                        }
                    };
                    let (ip, oop)''',
    "postflop rank",
    re.S
)
s=s.replace(
    'let scaled_tax = base_tax * gap as f32 / 5.0;',
    'let scaled_tax = base_tax * gap as f32 / (NUM_PLAYERS - 1) as f32;'
)

# Safety checks: no production-path 6-max constants may remain in the initializer/action logic.
required=[
    'pub const NUM_PLAYERS: usize = 9;',
    '"UTG+1"', '"UTG+2"', '"LJ"',
    'let sb = NUM_PLAYERS - 2;',
    'p == NUM_PLAYERS - 2',
    'base_tax * gap as f32 / (NUM_PLAYERS - 1) as f32'
]
for token in required:
    if token not in s:
        raise SystemExit(f"9max patch invariant missing: {token}")

if s==original:
    raise SystemExit("9max patch made no changes")

path.write_text(s,encoding="utf-8")
print("Patched DCFR preflop engine to native 9-max.")
