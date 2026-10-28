# View testability refactor — baseline layout digests

Layout digests of the test model before milestone 1's commit (HEAD 2974ee6 plus the uncommitted milestone 1 files), for `plan/view-testability-readability-refactor.md`. Every later milestone must print the same lines.

Command, per view (`<v>` = `1 Nesting`, `2 Edited`, `3 Network`):

```
node tools/compare-layouts.js . Scripts/View/test/model/view-test.archimate "Views/Test/<v>" Scripts/View/presets/Test/baseline/*.json
```

- Line format: preset, algorithm, digest of the LayoutResult, nodes `n`, edges `e`. The harness leaves diagram objects (notes, groups) out, so view 1 has 13 nodes (12 elements + Data X's second occurrence) and view 2 has 15.
- Presets: the two in `presets/Test/baseline/`, the folder that holds what the baseline needs (`baseline.json`, `AlgoTwopi.json`; the latter is a copy of `presets/Test/AlgoTwopi.json`, so the working preset can change). Every algorithm runs per preset.
- Two runs gave identical output.
- The Graphviz algorithms (Circo, Dot, FDP, Neato, SFDP, Twopi) report `ERROR TypeError: Files.createTempFile is not a function` in Node until milestone 4; the digest lines for them stay `ERROR` until then. They are left out below (36 lines).

## 1 Nesting

```
AlgoTwopi.json           Layered  7198ccf5b43b 12n 13e
AlgoTwopi.json           Tree     848ab9cb6c0b 12n 12e
AlgoTwopi.json           Stress   fe4978929a94 12n 12e
AlgoTwopi.json           Radial   ab0b30569b61 12n 11e
AlgoTwopi.json           Grid     73785710e743 12n 0e
AlgoTwopi.json           Pack     73785710e743 12n 0e
AlgoTwopi.json           Dagre    6502b96dd8d5 12n 13e
baseline.json            Layered  cfc465948332 13n 7e
baseline.json            Tree     b1d829664303 13n 6e
baseline.json            Stress   d395325e71dc 12n 12e
baseline.json            Radial   f46e0566fc3a 12n 11e
baseline.json            Grid     e9a7458c9fe5 13n 0e
baseline.json            Pack     b9381a3b68ea 13n 0e
baseline.json            Dagre    e856140725a4 13n 7e
```

## 2 Edited

```
AlgoTwopi.json           Layered  6c41d6871980 14n 14e
AlgoTwopi.json           Tree     d605781cf6f7 14n 13e
AlgoTwopi.json           Stress   7e319823bc0a 14n 13e
AlgoTwopi.json           Radial   3b7d7e94b85b 14n 13e
AlgoTwopi.json           Grid     fbf629aae0c1 14n 0e
AlgoTwopi.json           Pack     f1a4848e7c9f 14n 0e
AlgoTwopi.json           Dagre    242fc7f29a3c 14n 14e
baseline.json            Layered  098a67325298 15n 8e
baseline.json            Tree     44fc926e1141 15n 7e
baseline.json            Stress   7be08d63fe46 14n 13e
baseline.json            Radial   3b7d7e94b85b 14n 13e
baseline.json            Grid     af3323ef212c 15n 0e
baseline.json            Pack     4a0835004286 15n 0e
baseline.json            Dagre    8dae4b3b61fb 15n 8e
```

## 3 Network

```
AlgoTwopi.json           Layered  15a655518b71 20n 21e
AlgoTwopi.json           Tree     5afe05d64416 20n 21e
AlgoTwopi.json           Stress   ad1b7e8ff0d3 20n 21e
AlgoTwopi.json           Radial   4ed207fa63c9 20n 19e
AlgoTwopi.json           Grid     da2cafb0ecac 20n 0e
AlgoTwopi.json           Pack     06b6261ef3d9 20n 0e
AlgoTwopi.json           Dagre    95b18e234850 20n 21e
baseline.json            Layered  1c972f49f05f 20n 21e
baseline.json            Tree     b28122524268 20n 21e
baseline.json            Stress   a0561f53d164 20n 21e
baseline.json            Radial   a1db51ba28b3 20n 19e
baseline.json            Grid     02263949859b 20n 0e
baseline.json            Pack     f3b130e10ff6 20n 0e
baseline.json            Dagre    4112a4e5d6be 20n 21e
```

# Digests of tools/compare-layouts.js from milestone 3, step "layout_graph.js move, shrinking the harness"

The tool now lays out what a New view run makes (the harness's `planView`: filter, the preset's steps, diagram objects, nesting), so its digests differ from the ones above, which are of the old harness path (all relations between the view's elements, no steps, no diagram objects). The code move itself changed no layout: the old path on the moved `layout_graph.js` reproduces all 42 digests above. Later steps must print these lines. Command, per view:

```
node tools/compare-layouts.js . Scripts/View/test/model/view-test.archimate "Views/Test/<v>" Scripts/View/presets/Test/baseline/*.json
```

Same Graphviz `ERROR` lines left out (36).

## 1 Nesting (planView)

```
AlgoTwopi.json           Layered  ffa3f7d3009f 15n 13e
AlgoTwopi.json           Tree     f5cad681f5ab 15n 12e
AlgoTwopi.json           Stress   bcefa5385fc8 15n 12e
AlgoTwopi.json           Radial   59b79549fe83 15n 14e
AlgoTwopi.json           Grid     5d2f9775cc7b 15n 0e
AlgoTwopi.json           Pack     1c74164b329a 15n 0e
AlgoTwopi.json           Dagre    692514abfc6e 15n 13e
baseline.json            Layered  351e036c81b0 16n 7e
baseline.json            Tree     a5251fad861e 16n 6e
baseline.json            Stress   575fafcc40bf 15n 12e
baseline.json            Radial   01ad56f18413 15n 14e
baseline.json            Grid     d3f228a19407 16n 0e
baseline.json            Pack     6721ec9fa7dd 16n 0e
baseline.json            Dagre    c17afc24ee37 16n 7e
```

## 2 Edited (planView)

```
AlgoTwopi.json           Layered  89ac3c7323ef 17n 14e
AlgoTwopi.json           Tree     ff27be69d9e7 17n 13e
AlgoTwopi.json           Stress   51e42f3be2c1 17n 13e
AlgoTwopi.json           Radial   5d08c78175e4 17n 16e
AlgoTwopi.json           Grid     59f10a09df46 17n 0e
AlgoTwopi.json           Pack     15699c51f8de 17n 0e
AlgoTwopi.json           Dagre    8a6e02451576 17n 14e
baseline.json            Layered  6cc95d1063fd 19n 9e
baseline.json            Tree     1cc4025e37bd 19n 8e
baseline.json            Stress   80e0d483e099 18n 14e
baseline.json            Radial   16bc3061ec41 18n 17e
baseline.json            Grid     5af7a199d9d0 19n 0e
baseline.json            Pack     ac93fae1bf9c 19n 0e
baseline.json            Dagre    ac55a92d5bda 19n 9e
```

## 3 Network (planView)

```
AlgoTwopi.json           Layered  321c76f6ebc0 20n 21e
AlgoTwopi.json           Tree     b6a9234815fb 20n 21e
AlgoTwopi.json           Stress   3df81246f896 20n 21e
AlgoTwopi.json           Radial   4ed207fa63c9 20n 19e
AlgoTwopi.json           Grid     da2cafb0ecac 20n 0e
AlgoTwopi.json           Pack     06b6261ef3d9 20n 0e
AlgoTwopi.json           Dagre    6e80fea9b4f8 20n 21e
baseline.json            Layered  9ca0c436c7fa 20n 21e
baseline.json            Tree     5dba8f217690 20n 21e
baseline.json            Stress   02e8a48ca0fd 20n 21e
baseline.json            Radial   a1db51ba28b3 20n 19e
baseline.json            Grid     02263949859b 20n 0e
baseline.json            Pack     f3b130e10ff6 20n 0e
baseline.json            Dagre    20f3ca787bda 20n 21e
```

# Graphviz digests from milestone 4, step "Graphviz runner"

The Graphviz algorithms now run in Node (`dot` 14.1.4 on the PATH, started by `tools/process_runner_node.js`), so the `ERROR` lines left out above are recorded here (12 per view; planView). Every other line is unchanged (checked). A different `dot` version can give other digests (test case 10). Two runs identical.

## 1 Nesting (planView)

```
AlgoTwopi.json           Dot      f21cda475b3a 15n 13e
AlgoTwopi.json           Neato    f2e170a9f35f 15n 13e
AlgoTwopi.json           FDP      b439b1e566ff 15n 13e
AlgoTwopi.json           SFDP     84eec9fdda80 15n 13e
AlgoTwopi.json           Twopi    ecdcd51138ed 15n 13e
AlgoTwopi.json           Circo    78cadbaacd8b 15n 13e
baseline.json            Dot      72a872509eab 16n 7e
baseline.json            Neato    e85ee79e9079 15n 13e
baseline.json            FDP      d85f3808f271 16n 7e
baseline.json            SFDP     f41a2918566f 15n 13e
baseline.json            Twopi    8cc164954ce8 15n 13e
baseline.json            Circo    3348e42ad301 15n 13e
```

## 2 Edited (planView)

```
AlgoTwopi.json           Dot      30d3dc527f83 17n 14e
AlgoTwopi.json           Neato    84dae7a57d0b 17n 14e
AlgoTwopi.json           FDP      8e43155e0db4 17n 14e
AlgoTwopi.json           SFDP     22474fc04426 17n 14e
AlgoTwopi.json           Twopi    23b9f7dfd4ff 17n 14e
AlgoTwopi.json           Circo    5e96f0281ca3 17n 14e
baseline.json            Dot      eadc93a01c73 19n 9e
baseline.json            Neato    689f623f3abb 18n 15e
baseline.json            FDP      63be15958e7e 19n 9e
baseline.json            SFDP     bf3cf0541b41 18n 15e
baseline.json            Twopi    7e6af644794e 18n 15e
baseline.json            Circo    ed82491c5de0 18n 15e
```

## 3 Network (planView)

```
AlgoTwopi.json           Dot      7efb1666e587 20n 21e
AlgoTwopi.json           Neato    be4b488dda9a 20n 21e
AlgoTwopi.json           FDP      dc16d865e5f1 20n 21e
AlgoTwopi.json           SFDP     d52420b9ed6b 20n 21e
AlgoTwopi.json           Twopi    628ae9106941 20n 21e
AlgoTwopi.json           Circo    05ccc3acffd2 20n 21e
baseline.json            Dot      15bdef880824 20n 21e
baseline.json            Neato    df1c5a43191d 20n 21e
baseline.json            FDP      89025b75d8ba 20n 21e
baseline.json            SFDP     79865962a3ab 20n 21e
baseline.json            Twopi    ed6f29ad2687 20n 21e
baseline.json            Circo    20de0a992175 20n 21e
```

# Digests from test case 16 (New view copies diagram objects)

A New view run now lays out a note's line to an element and a diagram-block as one node with its contents, so every line of views 1 and 2 differs from the ones above; view 3 (no diagram objects) is unchanged (checked). `dot` 14.1.4. Later steps must print these lines.

## 1 Nesting (planView)

```
AlgoTwopi.json           Layered  5f8eb2c62925 14n 14e
AlgoTwopi.json           Tree     11df4221faa5 14n 13e
AlgoTwopi.json           Stress   e0532c7f0630 14n 13e
AlgoTwopi.json           Radial   f2f60c6af12a 14n 13e
AlgoTwopi.json           Grid     ec6ea5eac38e 14n 0e
AlgoTwopi.json           Pack     6b21b60578c5 14n 0e
AlgoTwopi.json           Dagre    44f8d2787589 14n 14e
AlgoTwopi.json           Dot      4f3d1f9ff54c 14n 14e
AlgoTwopi.json           Neato    145bf252ec42 14n 14e
AlgoTwopi.json           FDP      f76e47a8ae8b 14n 14e
AlgoTwopi.json           SFDP     e5ca9569b938 14n 14e
AlgoTwopi.json           Twopi    a92d22f1eb00 14n 14e
AlgoTwopi.json           Circo    66a72ac78908 14n 14e
baseline.json            Layered  90208e199a3f 15n 8e
baseline.json            Tree     830357eb745b 15n 7e
baseline.json            Stress   afb7a7a05ce2 14n 13e
baseline.json            Radial   f2f60c6af12a 14n 13e
baseline.json            Grid     fbc9cf261983 15n 0e
baseline.json            Pack     23a0dc80c763 15n 0e
baseline.json            Dagre    2980134f3ac0 15n 8e
baseline.json            Dot      9b1ac65028e3 15n 8e
baseline.json            Neato    426615418ab9 14n 14e
baseline.json            FDP      01ad65d2d68c 15n 8e
baseline.json            SFDP     543262d785b4 14n 14e
baseline.json            Twopi    b0883e8660f1 14n 14e
baseline.json            Circo    fa48a407d870 14n 14e
```

## 2 Edited (planView)

```
AlgoTwopi.json           Layered  e648d23677d0 15n 15e
AlgoTwopi.json           Tree     c373db260242 15n 14e
AlgoTwopi.json           Stress   c0c94cdbdca9 15n 14e
AlgoTwopi.json           Radial   7c8d6d4b7581 15n 14e
AlgoTwopi.json           Grid     31de70b94d9d 15n 0e
AlgoTwopi.json           Pack     c1aa8898a653 15n 0e
AlgoTwopi.json           Dagre    0e89413232fe 15n 15e
AlgoTwopi.json           Dot      0b2a2320c665 15n 15e
AlgoTwopi.json           Neato    272f8772fcb0 15n 15e
AlgoTwopi.json           FDP      fe8351635935 15n 15e
AlgoTwopi.json           SFDP     2234fe339b06 15n 15e
AlgoTwopi.json           Twopi    6e308d8aa3c5 15n 15e
AlgoTwopi.json           Circo    1503a278a5a6 15n 15e
baseline.json            Layered  4986035eabf5 17n 10e
baseline.json            Tree     1f81bbe2229e 17n 9e
baseline.json            Stress   d6a3fe893788 16n 15e
baseline.json            Radial   4c83e44cf15b 16n 15e
baseline.json            Grid     bbae8859eaf0 17n 0e
baseline.json            Pack     f9a3d386d158 17n 0e
baseline.json            Dagre    e2f0cffe00c1 17n 10e
baseline.json            Dot      db5bf219d157 17n 10e
baseline.json            Neato    ba02129c1f54 16n 16e
baseline.json            FDP      98848e372a6c 17n 10e
baseline.json            SFDP     fe94d61e40a7 16n 16e
baseline.json            Twopi    90e7fd4f6b8e 16n 16e
baseline.json            Circo    b0980fb72ab9 16n 16e
```
