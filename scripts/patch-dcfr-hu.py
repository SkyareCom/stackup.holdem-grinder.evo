#!/usr/bin/env python3
from pathlib import Path
import re, sys

if len(sys.argv)!=2:
    raise SystemExit("usage: patch-dcfr-hu.py <src/preflop.rs>")

path=Path(sys.argv[1])
s=path.read_text(encoding="utf-8")
original=s

def sub_once(pattern,repl,label,flags=0):
    global s
    s2,n=re.subn(pattern,repl,s,count=1,flags=flags)
    if n!=1:
        raise SystemExit(f"HU patch failed at {label}: matches={n}")
    s=s2

sub_once(
    r'pub const NUM_PLAYERS: usize = 6;\s*pub const POSITION_NAMES: \[&str; 6\] = \["UTG", "HJ", "CO", "BTN", "SB", "BB"\];',
    'pub const NUM_PLAYERS: usize = 2;\npub const POSITION_NAMES: [&str; 2] = ["SB", "BB"];',
    "constants"
)

sub_once(
    r'pub fn new_6max\(config: PreflopBetConfig\) -> Self \{.*?\n    \}\n\n    /// Heads-up',
'''pub fn new_6max(config: PreflopBetConfig) -> Self {
        let mut stacks = [200; NUM_PLAYERS];
        let mut bets = [0i32; NUM_PLAYERS];
        let sb = 0usize;
        let bb = 1usize;
        stacks[sb] -= 1;
        stacks[bb] -= 2;
        bets[sb] = 1;
        bets[bb] = 2;
        PreflopState {
            stacks,
            bets,
            folded: [false; NUM_PLAYERS],
            has_acted: [false; NUM_PLAYERS],
            all_in: [false; NUM_PLAYERS],
            to_act: sb as u8,
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

sub_once(
    r'pub fn new_heads_up\(config: PreflopBetConfig\) -> Self \{.*?\n    \}\n\n    pub fn active_count',
'''pub fn new_heads_up(config: PreflopBetConfig) -> Self {
        Self::new_6max(config)
    }

    pub fn active_count''',
    "heads-up initializer",
    re.S
)

s=s.replace('(p == 4 && self.config.sb_limp)','(p == 0 && self.config.sb_limp)')
s=s.replace('depth == 0 && p == 4','depth == 0 && p == 0')
s=s.replace('for pos in 0..4 {','for pos in 0..1 {')

# Training helper blind indices.
s=s.replace(
'''            state.holes[4] = Hand::new().add(c1).add(c2);
            state.holes[5] = Hand::new().add(c3).add(c4);

            // Traverser alternates SB(4) and BB(5)
            let traverser = if i % 2 == 0 { 4 } else { 5 };''',
'''            state.holes[0] = Hand::new().add(c1).add(c2);
            state.holes[1] = Hand::new().add(c3).add(c4);

            let traverser = if i % 2 == 0 { 0 } else { 1 };'''
)

# Generic postflop positional ordering if present.
m=re.search(r'let postflop_rank = \|p: usize\| -> usize \{\s*match p \{.*?\n\s*\}\s*\};\s*let \(ip, oop\)',s,re.S)
if m:
    s=s[:m.start()]+'''let postflop_rank = |p: usize| -> usize { p };
                    let (ip, oop)'''+s[m.end():]
s=s.replace('let scaled_tax = base_tax * gap as f32 / 5.0;','let scaled_tax = base_tax * gap as f32;')

for token in ['pub const NUM_PLAYERS: usize = 2;','["SB", "BB"]','p == 0 && self.config.sb_limp']:
    if token not in s:
        raise SystemExit(f"HU patch invariant missing: {token}")

if s==original:
    raise SystemExit("HU patch made no changes")
path.write_text(s,encoding="utf-8")
print("Patched DCFR preflop engine to native heads-up.")
