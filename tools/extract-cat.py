#!/usr/bin/env python3
"""Lift the logo cat out of the SynthSoup screen capture.

The cat is the logo, but the only copy of it in this repository is inside
synthsoup/assets/soup-cat.gif — a 240x240 recording of the synth's display,
with UI drawn over it. This gets the art out without redrawing it:

  * frame 0, coalesced (the GIF stores later frames as deltas)
  * cropped to the head: the cat in the GIF holds a bowl of its own, and the
    icon already has one, so the body and tail are left behind
  * the filter-cutoff line that crosses the muzzle (rows 138-139, #ff55d5)
    repaired from the rows either side, so the tongue carries through
  * the screen keyed out by flooding in from the border rather than by
    colour, because the cat's own outline is near-black and keying that by
    colour cuts the drawing out of itself
  * dithered pixels left stranded outside the silhouette removed

Writes icons/soup-cat-head.png. Needs ImageMagick; PIL is not used because
it is broken in some of the containers this runs in.

    python3 tools/extract-cat.py
"""
import re, subprocess, sys
from collections import deque
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GIF  = ROOT / "synthsoup/assets/soup-cat.gif"
OUT  = ROOT / "icons/soup-cat-head.png"

X0, Y0, W, H = 130, 78, 110, 68      # the head, measured off the frame
UI      = (255, 85, 213)             # the filter line
UI_ROWS = (138, 139)
SCREEN  = {(32,12,49), (8,4,16), (16,7,26), (20,8,32), (18,2,24), (32,12,32)}

def run(*a):
    return subprocess.run(a, capture_output=True, check=True)

def main():
    if not GIF.is_file():
        sys.exit(f"extract-cat: no {GIF}")
    tmp = ROOT / ".cat-frame0.png"
    run("convert", f"{GIF}[0]", "-coalesce", str(tmp))
    dump = subprocess.run(["convert", str(tmp), "-depth", "8", "txt:-"],
                          capture_output=True, text=True, check=True).stdout
    tmp.unlink()

    px = {}
    for line in dump.splitlines():
        m = re.match(r'(\d+),(\d+): \(\s*(\d+),\s*(\d+),\s*(\d+)', line)
        if m:
            x, y, r, g, b = map(int, m.groups())
            px[(x, y)] = (r, g, b)

    def at(x, y):
        gy = Y0 + y
        c = px.get((X0 + x, gy), (0, 0, 0))
        if c == UI:
            c = px.get((X0 + x, 137 if gy == UI_ROWS[0] else gy + 1), c)
        return c

    def near(c, tol=18):
        return any(abs(c[0]-t[0]) + abs(c[1]-t[1]) + abs(c[2]-t[2]) <= tol for t in SCREEN)

    alpha = [[255] * W for _ in range(H)]
    q = deque()
    def seed(x, y):
        if alpha[y][x] and near(at(x, y)):
            alpha[y][x] = 0; q.append((x, y))
    for x in range(W): seed(x, 0); seed(x, H - 1)
    for y in range(H): seed(0, y); seed(W - 1, y)
    while q:
        x, y = q.popleft()
        for dx, dy in ((1,0), (-1,0), (0,1), (0,-1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < W and 0 <= ny < H: seed(nx, ny)

    # A pixel of the cat's outline has cat on one side; a leftover speck of
    # screen has nothing on any side.
    for _ in range(2):
        drop = [(x, y) for y in range(H) for x in range(W)
                if alpha[y][x] and max(at(x, y)) < 95
                and sum(1 for dx in (-1,0,1) for dy in (-1,0,1)
                        if (dx or dy) and (not (0 <= x+dx < W and 0 <= y+dy < H)
                                           or not alpha[y+dy][x+dx])) >= 6]
        for x, y in drop: alpha[y][x] = 0

    # The tail curls up past the jaw, and the top of the chest shows under the
    # left cheek. Both are loose fragments once the body is cropped away. The
    # cheek itself has ended by row 57, so this takes none of the face.
    for y in range(57, H):
        for x in range(28): alpha[y][x] = 0

    pam = ROOT / ".cat.pam"
    with pam.open("wb") as f:
        f.write(b"P7\nWIDTH %d\nHEIGHT %d\nDEPTH 4\nMAXVAL 255\nTUPLTYPE RGB_ALPHA\nENDHDR\n" % (W, H))
        for y in range(H):
            for x in range(W):
                c = at(x, y); f.write(bytes((c[0], c[1], c[2], alpha[y][x])))
    run("convert", str(pam), "-trim", "+repage", "-define", "png:color-type=6", str(OUT))
    pam.unlink()
    size = subprocess.run(["identify", "-format", "%wx%h", str(OUT)],
                          capture_output=True, text=True).stdout
    print(f"extract-cat: wrote {OUT.relative_to(ROOT)} at {size}")

main()
