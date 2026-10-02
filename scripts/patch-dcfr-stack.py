#!/usr/bin/env python3
from pathlib import Path
import re, sys

if len(sys.argv)!=3:
    raise SystemExit("usage: patch-dcfr-stack.py <src/preflop.rs> <stack_bb>")

path=Path(sys.argv[1])
stack_bb=float(sys.argv[2])
if not (2 <= stack_bb <= 500):
    raise SystemExit("stack_bb must be between 2 and 500")
chips=int(round(stack_bb*2))
if abs(chips/2-stack_bb)>1e-9:
    raise SystemExit("stack_bb must use 0.5bb increments")

s=path.read_text(encoding="utf-8")
original=s

# Full-ring initializer (works before or after the 9-max patch).
s,n1=re.subn(r'let mut stacks = \[200; NUM_PLAYERS\];',f'let mut stacks = [{chips}; NUM_PLAYERS];',s)

# Native 6-max HU initializer.
s,n2=re.subn(r'stacks\[4\] = 200 - 1;',f'stacks[4] = {chips} - 1;',s)
s,n3=re.subn(r'stacks\[5\] = 200 - 2;',f'stacks[5] = {chips} - 2;',s)

# Patched full-ring / 9-max HU initializer.
s,n4=re.subn(r'stacks\[sb\] = 200 - 1;',f'stacks[sb] = {chips} - 1;',s)
s,n5=re.subn(r'stacks\[bb\] = 200 - 2;',f'stacks[bb] = {chips} - 2;',s)

if n1<1:
    raise SystemExit("stack patch failed: full-ring initializer not found")
hu_delegates = 'pub const NUM_PLAYERS: usize = 2;' in s and 'Self::new_6max(config)' in s
if not hu_delegates and (n2+n4<1 or n3+n5<1):
    raise SystemExit("stack patch failed: heads-up initializer not found")
if s==original:
    if chips==200:
        print("DCFR preflop starting stack already equals 100bb (200 chips); no patch required.")
        raise SystemExit(0)
    raise SystemExit("stack patch made no changes")

path.write_text(s,encoding="utf-8")
print(f"Patched DCFR preflop starting stack to {stack_bb:g}bb ({chips} chips).")
