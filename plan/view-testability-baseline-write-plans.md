# View testability refactor — baseline write-plan digests

Write-plan digests of the test model from milestone 3, step "write plan / apply split" (HEAD 1f36322 plus that step's uncommitted files), for `plan/view-testability-readability-refactor.md`. Every later step must print the same lines.

Command:

```
node Scripts/View/tools/write_plans.js
```

- Line format: preset, algorithm, view, action, digest of the write plan (`--full` prints the JSON), nodes written `n`, laid-out connections `c`, nestings `nest`, managed occurrences removed `rm`.
- Input: the harness's `readSnapshot` of each view as if selected on its canvas (every element of the view is the selection), the presets in `presets/Test/baseline/` with every algorithm. Graphviz algorithms are `ERROR` in Node until milestone 4.
- The harness reads every object inside a diagram-block as its contents (SPEC § 5); Archi's reader still misses notes and groups there (finding in the progress log), so view 2's Modify plans differ from Archi's there.

```
AlgoTwopi.json   Layered  1 Nesting  new_view    b1a3f78af3eb 12n 13c 0nest 0rm
AlgoTwopi.json   Layered  1 Nesting  expand_view f65bdbe697bb 14n 13c 0nest 0rm
AlgoTwopi.json   Layered  1 Nesting  layout_only f65bdbe697bb 14n 13c 0nest 0rm
AlgoTwopi.json   Layered  2 Edited   new_view    ca934311de93 14n 14c 0nest 0rm
AlgoTwopi.json   Layered  2 Edited   expand_view 5edb76fdcc4e 15n 15c 0nest 1rm
AlgoTwopi.json   Layered  2 Edited   layout_only 5edb76fdcc4e 15n 15c 0nest 1rm
AlgoTwopi.json   Layered  3 Network  new_view    c453fd99e413 20n 21c 0nest 0rm
AlgoTwopi.json   Layered  3 Network  expand_view 167a91a82e14 20n 21c 0nest 0rm
AlgoTwopi.json   Layered  3 Network  layout_only 167a91a82e14 20n 21c 0nest 0rm
AlgoTwopi.json   Tree     1 Nesting  new_view    be0c011d5634 12n 12c 0nest 0rm
AlgoTwopi.json   Tree     1 Nesting  expand_view 469c7d643a1f 14n 12c 0nest 0rm
AlgoTwopi.json   Tree     1 Nesting  layout_only 469c7d643a1f 14n 12c 0nest 0rm
AlgoTwopi.json   Tree     2 Edited   new_view    f61207f9aad9 14n 13c 0nest 0rm
AlgoTwopi.json   Tree     2 Edited   expand_view 7098c8d61c70 15n 14c 0nest 1rm
AlgoTwopi.json   Tree     2 Edited   layout_only 7098c8d61c70 15n 14c 0nest 1rm
AlgoTwopi.json   Tree     3 Network  new_view    29363ddd5059 20n 21c 0nest 0rm
AlgoTwopi.json   Tree     3 Network  expand_view c45a5a0e18f8 20n 21c 0nest 0rm
AlgoTwopi.json   Tree     3 Network  layout_only c45a5a0e18f8 20n 21c 0nest 0rm
AlgoTwopi.json   Stress   1 Nesting  new_view    f236cc1902be 12n 12c 0nest 0rm
AlgoTwopi.json   Stress   1 Nesting  expand_view 9d2421d38c10 14n 12c 0nest 0rm
AlgoTwopi.json   Stress   1 Nesting  layout_only 9d2421d38c10 14n 12c 0nest 0rm
AlgoTwopi.json   Stress   2 Edited   new_view    43603dc8807d 14n 13c 0nest 0rm
AlgoTwopi.json   Stress   2 Edited   expand_view 3ac6fe63984b 15n 14c 0nest 1rm
AlgoTwopi.json   Stress   2 Edited   layout_only 3ac6fe63984b 15n 14c 0nest 1rm
AlgoTwopi.json   Stress   3 Network  new_view    5ab5a504a0f6 20n 21c 0nest 0rm
AlgoTwopi.json   Stress   3 Network  expand_view db9b82bd1b1b 20n 21c 0nest 0rm
AlgoTwopi.json   Stress   3 Network  layout_only db9b82bd1b1b 20n 21c 0nest 0rm
AlgoTwopi.json   Radial   1 Nesting  new_view    289b48347ba9 12n 10c 0nest 0rm
AlgoTwopi.json   Radial   1 Nesting  expand_view f13eb3cbda10 14n 10c 0nest 0rm
AlgoTwopi.json   Radial   1 Nesting  layout_only f13eb3cbda10 14n 10c 0nest 0rm
AlgoTwopi.json   Radial   2 Edited   new_view    6b98b459e14a 14n 11c 0nest 0rm
AlgoTwopi.json   Radial   2 Edited   expand_view f2c368b37661 15n 12c 0nest 1rm
AlgoTwopi.json   Radial   2 Edited   layout_only f2c368b37661 15n 12c 0nest 1rm
AlgoTwopi.json   Radial   3 Network  new_view    f34d77c79f9a 20n 18c 0nest 0rm
AlgoTwopi.json   Radial   3 Network  expand_view 5e78ef1ebfc1 20n 18c 0nest 0rm
AlgoTwopi.json   Radial   3 Network  layout_only 5e78ef1ebfc1 20n 18c 0nest 0rm
AlgoTwopi.json   Grid     1 Nesting  new_view    f65426528e7c 12n 0c 0nest 0rm
AlgoTwopi.json   Grid     1 Nesting  expand_view 62d34820183b 14n 0c 0nest 0rm
AlgoTwopi.json   Grid     1 Nesting  layout_only 62d34820183b 14n 0c 0nest 0rm
AlgoTwopi.json   Grid     2 Edited   new_view    452f46fd0132 14n 0c 0nest 0rm
AlgoTwopi.json   Grid     2 Edited   expand_view 979489ee5011 15n 0c 0nest 1rm
AlgoTwopi.json   Grid     2 Edited   layout_only 979489ee5011 15n 0c 0nest 1rm
AlgoTwopi.json   Grid     3 Network  new_view    e391371f66a8 20n 0c 0nest 0rm
AlgoTwopi.json   Grid     3 Network  expand_view 1393bdbe4add 20n 0c 0nest 0rm
AlgoTwopi.json   Grid     3 Network  layout_only 1393bdbe4add 20n 0c 0nest 0rm
AlgoTwopi.json   Pack     1 Nesting  new_view    0210f2c5a57b 12n 0c 0nest 0rm
AlgoTwopi.json   Pack     1 Nesting  expand_view acd0d32ecda6 14n 0c 0nest 0rm
AlgoTwopi.json   Pack     1 Nesting  layout_only acd0d32ecda6 14n 0c 0nest 0rm
AlgoTwopi.json   Pack     2 Edited   new_view    b079bfbdb3bc 14n 0c 0nest 0rm
AlgoTwopi.json   Pack     2 Edited   expand_view 2b0fe021ed43 15n 0c 0nest 1rm
AlgoTwopi.json   Pack     2 Edited   layout_only 2b0fe021ed43 15n 0c 0nest 1rm
AlgoTwopi.json   Pack     3 Network  new_view    2ad862cf2fdd 20n 0c 0nest 0rm
AlgoTwopi.json   Pack     3 Network  expand_view b80f9b426575 20n 0c 0nest 0rm
AlgoTwopi.json   Pack     3 Network  layout_only b80f9b426575 20n 0c 0nest 0rm
AlgoTwopi.json   Dagre    1 Nesting  new_view    f7815ad4f23d 12n 13c 0nest 0rm
AlgoTwopi.json   Dagre    1 Nesting  expand_view b888584c5694 14n 13c 0nest 0rm
AlgoTwopi.json   Dagre    1 Nesting  layout_only b888584c5694 14n 13c 0nest 0rm
AlgoTwopi.json   Dagre    2 Edited   new_view    2851a295c1ce 14n 14c 0nest 0rm
AlgoTwopi.json   Dagre    2 Edited   expand_view de52679eb971 15n 15c 0nest 1rm
AlgoTwopi.json   Dagre    2 Edited   layout_only de52679eb971 15n 15c 0nest 1rm
AlgoTwopi.json   Dagre    3 Network  new_view    8dee7341ef15 20n 21c 0nest 0rm
AlgoTwopi.json   Dagre    3 Network  expand_view 5afa0875a8aa 20n 21c 0nest 0rm
AlgoTwopi.json   Dagre    3 Network  layout_only 5afa0875a8aa 20n 21c 0nest 0rm
AlgoTwopi.json   Dot      1 Nesting  new_view    ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   Dot      1 Nesting  expand_view ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   Dot      1 Nesting  layout_only ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   Dot      2 Edited   new_view    ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   Dot      2 Edited   expand_view ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   Dot      2 Edited   layout_only ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   Dot      3 Network  new_view    ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   Dot      3 Network  expand_view ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   Dot      3 Network  layout_only ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   Neato    1 Nesting  new_view    ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   Neato    1 Nesting  expand_view ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   Neato    1 Nesting  layout_only ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   Neato    2 Edited   new_view    ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   Neato    2 Edited   expand_view ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   Neato    2 Edited   layout_only ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   Neato    3 Network  new_view    ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   Neato    3 Network  expand_view ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   Neato    3 Network  layout_only ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   FDP      1 Nesting  new_view    ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   FDP      1 Nesting  expand_view ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   FDP      1 Nesting  layout_only ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   FDP      2 Edited   new_view    ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   FDP      2 Edited   expand_view ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   FDP      2 Edited   layout_only ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   FDP      3 Network  new_view    ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   FDP      3 Network  expand_view ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   FDP      3 Network  layout_only ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   SFDP     1 Nesting  new_view    ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   SFDP     1 Nesting  expand_view ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   SFDP     1 Nesting  layout_only ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   SFDP     2 Edited   new_view    ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   SFDP     2 Edited   expand_view ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   SFDP     2 Edited   layout_only ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   SFDP     3 Network  new_view    ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   SFDP     3 Network  expand_view ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   SFDP     3 Network  layout_only ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   Twopi    1 Nesting  new_view    ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   Twopi    1 Nesting  expand_view ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   Twopi    1 Nesting  layout_only ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   Twopi    2 Edited   new_view    ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   Twopi    2 Edited   expand_view ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   Twopi    2 Edited   layout_only ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   Twopi    3 Network  new_view    ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   Twopi    3 Network  expand_view ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   Twopi    3 Network  layout_only ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   Circo    1 Nesting  new_view    ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   Circo    1 Nesting  expand_view ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   Circo    1 Nesting  layout_only ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   Circo    2 Edited   new_view    ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   Circo    2 Edited   expand_view ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   Circo    2 Edited   layout_only ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   Circo    3 Network  new_view    ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   Circo    3 Network  expand_view ERROR TypeError: Files.createTempFile is not a function
AlgoTwopi.json   Circo    3 Network  layout_only ERROR TypeError: Files.createTempFile is not a function
baseline.json    Layered  1 Nesting  new_view    71755b20f733 13n 7c 6nest 0rm
baseline.json    Layered  1 Nesting  expand_view dbab0fb16530 15n 8c 6nest 0rm
baseline.json    Layered  1 Nesting  layout_only 6e3e03e9ad74 15n 7c 6nest 0rm
baseline.json    Layered  2 Edited   new_view    0e6808bf1c3f 16n 9c 6nest 0rm
baseline.json    Layered  2 Edited   expand_view 3811cd6fb439 17n 10c 6nest 0rm
baseline.json    Layered  2 Edited   layout_only c00eecb1ad63 16n 9c 6nest 0rm
baseline.json    Layered  3 Network  new_view    48539d51b21d 20n 21c 0nest 0rm
baseline.json    Layered  3 Network  expand_view 5d59269f14e8 20n 21c 0nest 0rm
baseline.json    Layered  3 Network  layout_only 5d59269f14e8 20n 21c 0nest 0rm
baseline.json    Tree     1 Nesting  new_view    c2a0aac38acc 13n 6c 6nest 0rm
baseline.json    Tree     1 Nesting  expand_view 85fa56faf7a6 15n 7c 6nest 0rm
baseline.json    Tree     1 Nesting  layout_only 078fc0add371 15n 6c 6nest 0rm
baseline.json    Tree     2 Edited   new_view    f1db97ac9cb9 16n 8c 6nest 0rm
baseline.json    Tree     2 Edited   expand_view 0c7811915a81 17n 9c 6nest 0rm
baseline.json    Tree     2 Edited   layout_only c4d1bb20b474 16n 8c 6nest 0rm
baseline.json    Tree     3 Network  new_view    344143e6548c 20n 21c 0nest 0rm
baseline.json    Tree     3 Network  expand_view 7e74ce68b226 20n 21c 0nest 0rm
baseline.json    Tree     3 Network  layout_only 7e74ce68b226 20n 21c 0nest 0rm
baseline.json    Stress   1 Nesting  new_view    5d2b1ff2c7a0 12n 12c 0nest 0rm
baseline.json    Stress   1 Nesting  expand_view 42f8b960d082 14n 13c 0nest 0rm
baseline.json    Stress   1 Nesting  layout_only 70c19ae20d7d 14n 12c 0nest 0rm
baseline.json    Stress   2 Edited   new_view    f39bb4179b5c 15n 14c 0nest 0rm
baseline.json    Stress   2 Edited   expand_view 73368828de3d 16n 15c 0nest 1rm
baseline.json    Stress   2 Edited   layout_only 36361cecd5e3 15n 14c 0nest 1rm
baseline.json    Stress   3 Network  new_view    c6fd9c4d7923 20n 21c 0nest 0rm
baseline.json    Stress   3 Network  expand_view 21ac39a74e31 20n 21c 0nest 0rm
baseline.json    Stress   3 Network  layout_only 21ac39a74e31 20n 21c 0nest 0rm
baseline.json    Radial   1 Nesting  new_view    72118bdc79f2 12n 10c 0nest 0rm
baseline.json    Radial   1 Nesting  expand_view aea5a2e6bcb5 14n 11c 0nest 0rm
baseline.json    Radial   1 Nesting  layout_only f13eb3cbda10 14n 10c 0nest 0rm
baseline.json    Radial   2 Edited   new_view    fd1ee1b005d0 15n 12c 0nest 0rm
baseline.json    Radial   2 Edited   expand_view 27d1d7303238 16n 13c 0nest 1rm
baseline.json    Radial   2 Edited   layout_only f2c368b37661 15n 12c 0nest 1rm
baseline.json    Radial   3 Network  new_view    1ba027a1b7dc 20n 18c 0nest 0rm
baseline.json    Radial   3 Network  expand_view 5b1ea1a10b6b 20n 18c 0nest 0rm
baseline.json    Radial   3 Network  layout_only 5b1ea1a10b6b 20n 18c 0nest 0rm
baseline.json    Grid     1 Nesting  new_view    6e898e87433a 13n 0c 6nest 0rm
baseline.json    Grid     1 Nesting  expand_view a8825a462934 15n 0c 6nest 0rm
baseline.json    Grid     1 Nesting  layout_only a8825a462934 15n 0c 6nest 0rm
baseline.json    Grid     2 Edited   new_view    da03bd5fa63d 16n 0c 6nest 0rm
baseline.json    Grid     2 Edited   expand_view f6561662f87e 17n 0c 6nest 0rm
baseline.json    Grid     2 Edited   layout_only 757625ffee2e 16n 0c 6nest 0rm
baseline.json    Grid     3 Network  new_view    eb8a5711dfee 20n 0c 0nest 0rm
baseline.json    Grid     3 Network  expand_view 9acd405eb10b 20n 0c 0nest 0rm
baseline.json    Grid     3 Network  layout_only 9acd405eb10b 20n 0c 0nest 0rm
baseline.json    Pack     1 Nesting  new_view    db1f9f5d8b35 13n 0c 6nest 0rm
baseline.json    Pack     1 Nesting  expand_view 31439fef800b 15n 0c 6nest 0rm
baseline.json    Pack     1 Nesting  layout_only 31439fef800b 15n 0c 6nest 0rm
baseline.json    Pack     2 Edited   new_view    42b20adf55bc 16n 0c 6nest 0rm
baseline.json    Pack     2 Edited   expand_view 3065fce329eb 17n 0c 6nest 0rm
baseline.json    Pack     2 Edited   layout_only 9842cc0ecbd7 16n 0c 6nest 0rm
baseline.json    Pack     3 Network  new_view    a964e00c070d 20n 0c 0nest 0rm
baseline.json    Pack     3 Network  expand_view 17b357ef1dd6 20n 0c 0nest 0rm
baseline.json    Pack     3 Network  layout_only 17b357ef1dd6 20n 0c 0nest 0rm
baseline.json    Dagre    1 Nesting  new_view    3f1c5b32df86 13n 7c 6nest 0rm
baseline.json    Dagre    1 Nesting  expand_view 385785332b0f 15n 8c 6nest 0rm
baseline.json    Dagre    1 Nesting  layout_only 5842cd1979bb 15n 7c 6nest 0rm
baseline.json    Dagre    2 Edited   new_view    1296384d4b46 16n 9c 6nest 0rm
baseline.json    Dagre    2 Edited   expand_view b8c13f4667c4 17n 10c 6nest 0rm
baseline.json    Dagre    2 Edited   layout_only 12bd840adeeb 16n 9c 6nest 0rm
baseline.json    Dagre    3 Network  new_view    d5b1e60ada3a 20n 21c 0nest 0rm
baseline.json    Dagre    3 Network  expand_view 012df45b313b 20n 21c 0nest 0rm
baseline.json    Dagre    3 Network  layout_only 012df45b313b 20n 21c 0nest 0rm
baseline.json    Dot      1 Nesting  new_view    ERROR TypeError: Files.createTempFile is not a function
baseline.json    Dot      1 Nesting  expand_view ERROR TypeError: Files.createTempFile is not a function
baseline.json    Dot      1 Nesting  layout_only ERROR TypeError: Files.createTempFile is not a function
baseline.json    Dot      2 Edited   new_view    ERROR TypeError: Files.createTempFile is not a function
baseline.json    Dot      2 Edited   expand_view ERROR TypeError: Files.createTempFile is not a function
baseline.json    Dot      2 Edited   layout_only ERROR TypeError: Files.createTempFile is not a function
baseline.json    Dot      3 Network  new_view    ERROR TypeError: Files.createTempFile is not a function
baseline.json    Dot      3 Network  expand_view ERROR TypeError: Files.createTempFile is not a function
baseline.json    Dot      3 Network  layout_only ERROR TypeError: Files.createTempFile is not a function
baseline.json    Neato    1 Nesting  new_view    ERROR TypeError: Files.createTempFile is not a function
baseline.json    Neato    1 Nesting  expand_view ERROR TypeError: Files.createTempFile is not a function
baseline.json    Neato    1 Nesting  layout_only ERROR TypeError: Files.createTempFile is not a function
baseline.json    Neato    2 Edited   new_view    ERROR TypeError: Files.createTempFile is not a function
baseline.json    Neato    2 Edited   expand_view ERROR TypeError: Files.createTempFile is not a function
baseline.json    Neato    2 Edited   layout_only ERROR TypeError: Files.createTempFile is not a function
baseline.json    Neato    3 Network  new_view    ERROR TypeError: Files.createTempFile is not a function
baseline.json    Neato    3 Network  expand_view ERROR TypeError: Files.createTempFile is not a function
baseline.json    Neato    3 Network  layout_only ERROR TypeError: Files.createTempFile is not a function
baseline.json    FDP      1 Nesting  new_view    ERROR TypeError: Files.createTempFile is not a function
baseline.json    FDP      1 Nesting  expand_view ERROR TypeError: Files.createTempFile is not a function
baseline.json    FDP      1 Nesting  layout_only ERROR TypeError: Files.createTempFile is not a function
baseline.json    FDP      2 Edited   new_view    ERROR TypeError: Files.createTempFile is not a function
baseline.json    FDP      2 Edited   expand_view ERROR TypeError: Files.createTempFile is not a function
baseline.json    FDP      2 Edited   layout_only ERROR TypeError: Files.createTempFile is not a function
baseline.json    FDP      3 Network  new_view    ERROR TypeError: Files.createTempFile is not a function
baseline.json    FDP      3 Network  expand_view ERROR TypeError: Files.createTempFile is not a function
baseline.json    FDP      3 Network  layout_only ERROR TypeError: Files.createTempFile is not a function
baseline.json    SFDP     1 Nesting  new_view    ERROR TypeError: Files.createTempFile is not a function
baseline.json    SFDP     1 Nesting  expand_view ERROR TypeError: Files.createTempFile is not a function
baseline.json    SFDP     1 Nesting  layout_only ERROR TypeError: Files.createTempFile is not a function
baseline.json    SFDP     2 Edited   new_view    ERROR TypeError: Files.createTempFile is not a function
baseline.json    SFDP     2 Edited   expand_view ERROR TypeError: Files.createTempFile is not a function
baseline.json    SFDP     2 Edited   layout_only ERROR TypeError: Files.createTempFile is not a function
baseline.json    SFDP     3 Network  new_view    ERROR TypeError: Files.createTempFile is not a function
baseline.json    SFDP     3 Network  expand_view ERROR TypeError: Files.createTempFile is not a function
baseline.json    SFDP     3 Network  layout_only ERROR TypeError: Files.createTempFile is not a function
baseline.json    Twopi    1 Nesting  new_view    ERROR TypeError: Files.createTempFile is not a function
baseline.json    Twopi    1 Nesting  expand_view ERROR TypeError: Files.createTempFile is not a function
baseline.json    Twopi    1 Nesting  layout_only ERROR TypeError: Files.createTempFile is not a function
baseline.json    Twopi    2 Edited   new_view    ERROR TypeError: Files.createTempFile is not a function
baseline.json    Twopi    2 Edited   expand_view ERROR TypeError: Files.createTempFile is not a function
baseline.json    Twopi    2 Edited   layout_only ERROR TypeError: Files.createTempFile is not a function
baseline.json    Twopi    3 Network  new_view    ERROR TypeError: Files.createTempFile is not a function
baseline.json    Twopi    3 Network  expand_view ERROR TypeError: Files.createTempFile is not a function
baseline.json    Twopi    3 Network  layout_only ERROR TypeError: Files.createTempFile is not a function
baseline.json    Circo    1 Nesting  new_view    ERROR TypeError: Files.createTempFile is not a function
baseline.json    Circo    1 Nesting  expand_view ERROR TypeError: Files.createTempFile is not a function
baseline.json    Circo    1 Nesting  layout_only ERROR TypeError: Files.createTempFile is not a function
baseline.json    Circo    2 Edited   new_view    ERROR TypeError: Files.createTempFile is not a function
baseline.json    Circo    2 Edited   expand_view ERROR TypeError: Files.createTempFile is not a function
baseline.json    Circo    2 Edited   layout_only ERROR TypeError: Files.createTempFile is not a function
baseline.json    Circo    3 Network  new_view    ERROR TypeError: Files.createTempFile is not a function
baseline.json    Circo    3 Network  expand_view ERROR TypeError: Files.createTempFile is not a function
baseline.json    Circo    3 Network  layout_only ERROR TypeError: Files.createTempFile is not a function
```

# Graphviz digests from milestone 4, step "Graphviz runner"

The Graphviz algorithms now run in Node (`dot` 14.1.4 on the PATH, started by `tools/process_runner_node.js`), so the `ERROR` rows above are replaced by these. Every other row is unchanged (checked). A different `dot` version can give other digests (test case 10). Two runs identical. Same commands as above.

## Write plans (108 lines)

```
AlgoTwopi.json   Dot      1 Nesting  new_view    7a8c8d981e38 12n 13c 0nest 0rm
AlgoTwopi.json   Dot      1 Nesting  expand_view 4a54ed48d07d 14n 13c 0nest 0rm
AlgoTwopi.json   Dot      1 Nesting  layout_only 4a54ed48d07d 14n 13c 0nest 0rm
AlgoTwopi.json   Dot      2 Edited   new_view    56412d0af968 14n 14c 0nest 0rm
AlgoTwopi.json   Dot      2 Edited   expand_view eb671d9d8022 15n 15c 0nest 1rm
AlgoTwopi.json   Dot      2 Edited   layout_only eb671d9d8022 15n 15c 0nest 1rm
AlgoTwopi.json   Dot      3 Network  new_view    ee6ed2d360be 20n 21c 0nest 0rm
AlgoTwopi.json   Dot      3 Network  expand_view ae10cfc9fbf6 20n 21c 0nest 0rm
AlgoTwopi.json   Dot      3 Network  layout_only ae10cfc9fbf6 20n 21c 0nest 0rm
AlgoTwopi.json   Neato    1 Nesting  new_view    ee4fb7879319 12n 13c 0nest 0rm
AlgoTwopi.json   Neato    1 Nesting  expand_view 5c5d96a9d934 14n 13c 0nest 0rm
AlgoTwopi.json   Neato    1 Nesting  layout_only 5c5d96a9d934 14n 13c 0nest 0rm
AlgoTwopi.json   Neato    2 Edited   new_view    0677fd40f2b7 14n 14c 0nest 0rm
AlgoTwopi.json   Neato    2 Edited   expand_view 9b0ae741c492 15n 15c 0nest 1rm
AlgoTwopi.json   Neato    2 Edited   layout_only 9b0ae741c492 15n 15c 0nest 1rm
AlgoTwopi.json   Neato    3 Network  new_view    be85bd6031c7 20n 21c 0nest 0rm
AlgoTwopi.json   Neato    3 Network  expand_view e807cb2d7a14 20n 21c 0nest 0rm
AlgoTwopi.json   Neato    3 Network  layout_only e807cb2d7a14 20n 21c 0nest 0rm
AlgoTwopi.json   FDP      1 Nesting  new_view    88dbb4b63176 12n 13c 0nest 0rm
AlgoTwopi.json   FDP      1 Nesting  expand_view e72534f5fbe0 14n 13c 0nest 0rm
AlgoTwopi.json   FDP      1 Nesting  layout_only e72534f5fbe0 14n 13c 0nest 0rm
AlgoTwopi.json   FDP      2 Edited   new_view    19f218da15eb 14n 14c 0nest 0rm
AlgoTwopi.json   FDP      2 Edited   expand_view a0c196f9b67d 15n 15c 0nest 1rm
AlgoTwopi.json   FDP      2 Edited   layout_only a0c196f9b67d 15n 15c 0nest 1rm
AlgoTwopi.json   FDP      3 Network  new_view    1642d8222a50 20n 21c 0nest 0rm
AlgoTwopi.json   FDP      3 Network  expand_view ec1bbd482ed4 20n 21c 0nest 0rm
AlgoTwopi.json   FDP      3 Network  layout_only ec1bbd482ed4 20n 21c 0nest 0rm
AlgoTwopi.json   SFDP     1 Nesting  new_view    4162be082a05 12n 13c 0nest 0rm
AlgoTwopi.json   SFDP     1 Nesting  expand_view 59326c7895dd 14n 13c 0nest 0rm
AlgoTwopi.json   SFDP     1 Nesting  layout_only 59326c7895dd 14n 13c 0nest 0rm
AlgoTwopi.json   SFDP     2 Edited   new_view    c4c16a171a0f 14n 14c 0nest 0rm
AlgoTwopi.json   SFDP     2 Edited   expand_view e056e94048cd 15n 15c 0nest 1rm
AlgoTwopi.json   SFDP     2 Edited   layout_only e056e94048cd 15n 15c 0nest 1rm
AlgoTwopi.json   SFDP     3 Network  new_view    5037a3c23719 20n 21c 0nest 0rm
AlgoTwopi.json   SFDP     3 Network  expand_view 4b7af03b27c6 20n 21c 0nest 0rm
AlgoTwopi.json   SFDP     3 Network  layout_only 4b7af03b27c6 20n 21c 0nest 0rm
AlgoTwopi.json   Twopi    1 Nesting  new_view    5f4702a466bc 12n 13c 0nest 0rm
AlgoTwopi.json   Twopi    1 Nesting  expand_view 8cc24047a27f 14n 13c 0nest 0rm
AlgoTwopi.json   Twopi    1 Nesting  layout_only 8cc24047a27f 14n 13c 0nest 0rm
AlgoTwopi.json   Twopi    2 Edited   new_view    7ef81f28ffa7 14n 14c 0nest 0rm
AlgoTwopi.json   Twopi    2 Edited   expand_view 4426474c1b27 15n 15c 0nest 1rm
AlgoTwopi.json   Twopi    2 Edited   layout_only 4426474c1b27 15n 15c 0nest 1rm
AlgoTwopi.json   Twopi    3 Network  new_view    a53025d0737b 20n 21c 0nest 0rm
AlgoTwopi.json   Twopi    3 Network  expand_view bb88393b9741 20n 21c 0nest 0rm
AlgoTwopi.json   Twopi    3 Network  layout_only bb88393b9741 20n 21c 0nest 0rm
AlgoTwopi.json   Circo    1 Nesting  new_view    477dcc633b90 12n 13c 0nest 0rm
AlgoTwopi.json   Circo    1 Nesting  expand_view 3a3116ebd1c2 14n 13c 0nest 0rm
AlgoTwopi.json   Circo    1 Nesting  layout_only 3a3116ebd1c2 14n 13c 0nest 0rm
AlgoTwopi.json   Circo    2 Edited   new_view    3ed98afa27ac 14n 14c 0nest 0rm
AlgoTwopi.json   Circo    2 Edited   expand_view 7cbeed175680 15n 15c 0nest 1rm
AlgoTwopi.json   Circo    2 Edited   layout_only 7cbeed175680 15n 15c 0nest 1rm
AlgoTwopi.json   Circo    3 Network  new_view    0c8d90df8a8c 20n 21c 0nest 0rm
AlgoTwopi.json   Circo    3 Network  expand_view 07c9f612a326 20n 21c 0nest 0rm
AlgoTwopi.json   Circo    3 Network  layout_only 07c9f612a326 20n 21c 0nest 0rm
baseline.json    Dot      1 Nesting  new_view    43b60e8ea195 13n 7c 6nest 0rm
baseline.json    Dot      1 Nesting  expand_view e901d339b1bb 15n 8c 6nest 0rm
baseline.json    Dot      1 Nesting  layout_only 3d931d180576 15n 7c 6nest 0rm
baseline.json    Dot      2 Edited   new_view    9678d38cf3c7 16n 9c 6nest 0rm
baseline.json    Dot      2 Edited   expand_view f808ec30bf22 17n 10c 6nest 0rm
baseline.json    Dot      2 Edited   layout_only f9d7dbcccb85 16n 9c 6nest 0rm
baseline.json    Dot      3 Network  new_view    10b182411ca7 20n 21c 0nest 0rm
baseline.json    Dot      3 Network  expand_view 876ac922556c 20n 21c 0nest 0rm
baseline.json    Dot      3 Network  layout_only 876ac922556c 20n 21c 0nest 0rm
baseline.json    Neato    1 Nesting  new_view    721684224574 12n 13c 0nest 0rm
baseline.json    Neato    1 Nesting  expand_view 80ff17d2f98e 14n 14c 0nest 0rm
baseline.json    Neato    1 Nesting  layout_only 20780ef70571 14n 13c 0nest 0rm
baseline.json    Neato    2 Edited   new_view    680b8bb0e6db 15n 15c 0nest 0rm
baseline.json    Neato    2 Edited   expand_view a9514b609d5d 16n 16c 0nest 1rm
baseline.json    Neato    2 Edited   layout_only 6caff86567fe 15n 15c 0nest 1rm
baseline.json    Neato    3 Network  new_view    83a67f7c7b49 20n 21c 0nest 0rm
baseline.json    Neato    3 Network  expand_view 13fdfe700f78 20n 21c 0nest 0rm
baseline.json    Neato    3 Network  layout_only 13fdfe700f78 20n 21c 0nest 0rm
baseline.json    FDP      1 Nesting  new_view    864853bd9b4e 13n 7c 6nest 0rm
baseline.json    FDP      1 Nesting  expand_view cea61ddaef2e 15n 8c 6nest 0rm
baseline.json    FDP      1 Nesting  layout_only f3ac1777dd42 15n 7c 6nest 0rm
baseline.json    FDP      2 Edited   new_view    1a4fd50e3f4b 16n 9c 6nest 0rm
baseline.json    FDP      2 Edited   expand_view 136db31d4f8e 17n 10c 6nest 0rm
baseline.json    FDP      2 Edited   layout_only 4801f3d1e629 16n 9c 6nest 0rm
baseline.json    FDP      3 Network  new_view    aa89b31dc73c 20n 21c 0nest 0rm
baseline.json    FDP      3 Network  expand_view ad35e3ac2090 20n 21c 0nest 0rm
baseline.json    FDP      3 Network  layout_only ad35e3ac2090 20n 21c 0nest 0rm
baseline.json    SFDP     1 Nesting  new_view    2844a9aab9ec 12n 13c 0nest 0rm
baseline.json    SFDP     1 Nesting  expand_view 6ca9f5506e5b 14n 14c 0nest 0rm
baseline.json    SFDP     1 Nesting  layout_only 296512d4c8fa 14n 13c 0nest 0rm
baseline.json    SFDP     2 Edited   new_view    db7bab72a4b6 15n 15c 0nest 0rm
baseline.json    SFDP     2 Edited   expand_view 732a6a5dacb0 16n 16c 0nest 1rm
baseline.json    SFDP     2 Edited   layout_only 5ec94b7cd65d 15n 15c 0nest 1rm
baseline.json    SFDP     3 Network  new_view    87c5bf7a7d36 20n 21c 0nest 0rm
baseline.json    SFDP     3 Network  expand_view b447a0390709 20n 21c 0nest 0rm
baseline.json    SFDP     3 Network  layout_only b447a0390709 20n 21c 0nest 0rm
baseline.json    Twopi    1 Nesting  new_view    19d656888060 12n 13c 0nest 0rm
baseline.json    Twopi    1 Nesting  expand_view 1307109a52ce 14n 14c 0nest 0rm
baseline.json    Twopi    1 Nesting  layout_only ba131a72b658 14n 13c 0nest 0rm
baseline.json    Twopi    2 Edited   new_view    48f01ab5318c 15n 15c 0nest 0rm
baseline.json    Twopi    2 Edited   expand_view d6203e75e600 16n 16c 0nest 1rm
baseline.json    Twopi    2 Edited   layout_only 6f290133436b 15n 15c 0nest 1rm
baseline.json    Twopi    3 Network  new_view    0f974083eb09 20n 21c 0nest 0rm
baseline.json    Twopi    3 Network  expand_view 202f9ecb737c 20n 21c 0nest 0rm
baseline.json    Twopi    3 Network  layout_only 202f9ecb737c 20n 21c 0nest 0rm
baseline.json    Circo    1 Nesting  new_view    2c7f91e9554d 12n 13c 0nest 0rm
baseline.json    Circo    1 Nesting  expand_view a87648bd49c1 14n 14c 0nest 0rm
baseline.json    Circo    1 Nesting  layout_only c83940943531 14n 13c 0nest 0rm
baseline.json    Circo    2 Edited   new_view    e942f120a55e 15n 15c 0nest 0rm
baseline.json    Circo    2 Edited   expand_view 9d4813aeb117 16n 16c 0nest 1rm
baseline.json    Circo    2 Edited   layout_only faba1d15a5d6 15n 15c 0nest 1rm
baseline.json    Circo    3 Network  new_view    8f27c25b485d 20n 21c 0nest 0rm
baseline.json    Circo    3 Network  expand_view 0e7ffa84bbd8 20n 21c 0nest 0rm
baseline.json    Circo    3 Network  layout_only 0e7ffa84bbd8 20n 21c 0nest 0rm
```

# Digests from test case 16 (New view copies diagram objects)

Three presets from here on: `presets/Test/baseline/counters.json` (test case 16's check) is in the folder `write_plans.js` reads. Every digest changes: the write plan has a new field `copiedLines`. With an empty `copiedLines` left out of the hash, only the New view rows of views 1 and 2 differ from the lines above (78 of 351; checked); Modify rows and view 3 are unchanged. `dot` 14.1.4. Two runs identical. Later steps must print these lines.

Updated 2026-10-28 (Tree layer distance pads root-level containers, `plan/elk-adapter-size-analysis.md`): the 12 Tree rows of `baseline.json` and `counters.json` on views 1 and 2 changed; every other row is unchanged (checked).

## Write plans (351 lines)

```
AlgoTwopi.json   Layered  1 Nesting  new_view    a4e4489c80d9 15n 14c 0nest 0rm
AlgoTwopi.json   Layered  1 Nesting  expand_view e8c7049d07ca 14n 13c 0nest 0rm
AlgoTwopi.json   Layered  1 Nesting  layout_only e8c7049d07ca 14n 13c 0nest 0rm
AlgoTwopi.json   Layered  2 Edited   new_view    4c73be87e306 17n 15c 0nest 0rm
AlgoTwopi.json   Layered  2 Edited   expand_view 21c0dbfe46b6 15n 15c 0nest 1rm
AlgoTwopi.json   Layered  2 Edited   layout_only 21c0dbfe46b6 15n 15c 0nest 1rm
AlgoTwopi.json   Layered  3 Network  new_view    4945a4ee0325 20n 21c 0nest 0rm
AlgoTwopi.json   Layered  3 Network  expand_view 7c553236a5fa 20n 21c 0nest 0rm
AlgoTwopi.json   Layered  3 Network  layout_only 7c553236a5fa 20n 21c 0nest 0rm
AlgoTwopi.json   Tree     1 Nesting  new_view    f3e7aa6a4a82 15n 13c 0nest 0rm
AlgoTwopi.json   Tree     1 Nesting  expand_view 62c573d3c863 14n 12c 0nest 0rm
AlgoTwopi.json   Tree     1 Nesting  layout_only 62c573d3c863 14n 12c 0nest 0rm
AlgoTwopi.json   Tree     2 Edited   new_view    c5730fb680f4 17n 14c 0nest 0rm
AlgoTwopi.json   Tree     2 Edited   expand_view e5a22616965a 15n 14c 0nest 1rm
AlgoTwopi.json   Tree     2 Edited   layout_only e5a22616965a 15n 14c 0nest 1rm
AlgoTwopi.json   Tree     3 Network  new_view    277b54bb1e3e 20n 21c 0nest 0rm
AlgoTwopi.json   Tree     3 Network  expand_view 63904539de96 20n 21c 0nest 0rm
AlgoTwopi.json   Tree     3 Network  layout_only 63904539de96 20n 21c 0nest 0rm
AlgoTwopi.json   Stress   1 Nesting  new_view    a6e6c0313bf4 15n 13c 0nest 0rm
AlgoTwopi.json   Stress   1 Nesting  expand_view 3bf8822e7e6d 14n 12c 0nest 0rm
AlgoTwopi.json   Stress   1 Nesting  layout_only 3bf8822e7e6d 14n 12c 0nest 0rm
AlgoTwopi.json   Stress   2 Edited   new_view    88458f6cdea8 17n 14c 0nest 0rm
AlgoTwopi.json   Stress   2 Edited   expand_view c47a4545183e 15n 14c 0nest 1rm
AlgoTwopi.json   Stress   2 Edited   layout_only c47a4545183e 15n 14c 0nest 1rm
AlgoTwopi.json   Stress   3 Network  new_view    9e8d53697794 20n 21c 0nest 0rm
AlgoTwopi.json   Stress   3 Network  expand_view c5215d48c54c 20n 21c 0nest 0rm
AlgoTwopi.json   Stress   3 Network  layout_only c5215d48c54c 20n 21c 0nest 0rm
AlgoTwopi.json   Radial   1 Nesting  new_view    7bfb8e353aca 15n 11c 0nest 0rm
AlgoTwopi.json   Radial   1 Nesting  expand_view 7558c1e6eda6 14n 10c 0nest 0rm
AlgoTwopi.json   Radial   1 Nesting  layout_only 7558c1e6eda6 14n 10c 0nest 0rm
AlgoTwopi.json   Radial   2 Edited   new_view    08d1c44a4a63 17n 12c 0nest 0rm
AlgoTwopi.json   Radial   2 Edited   expand_view ec63b318c299 15n 12c 0nest 1rm
AlgoTwopi.json   Radial   2 Edited   layout_only ec63b318c299 15n 12c 0nest 1rm
AlgoTwopi.json   Radial   3 Network  new_view    df1f806a90d5 20n 18c 0nest 0rm
AlgoTwopi.json   Radial   3 Network  expand_view e8540ca26f54 20n 18c 0nest 0rm
AlgoTwopi.json   Radial   3 Network  layout_only e8540ca26f54 20n 18c 0nest 0rm
AlgoTwopi.json   Grid     1 Nesting  new_view    7009ca623dfa 15n 0c 0nest 0rm
AlgoTwopi.json   Grid     1 Nesting  expand_view 2608a11c78e4 14n 0c 0nest 0rm
AlgoTwopi.json   Grid     1 Nesting  layout_only 2608a11c78e4 14n 0c 0nest 0rm
AlgoTwopi.json   Grid     2 Edited   new_view    3ad1a2d002cf 17n 0c 0nest 0rm
AlgoTwopi.json   Grid     2 Edited   expand_view f903e61beebf 15n 0c 0nest 1rm
AlgoTwopi.json   Grid     2 Edited   layout_only f903e61beebf 15n 0c 0nest 1rm
AlgoTwopi.json   Grid     3 Network  new_view    341a0a96a2b4 20n 0c 0nest 0rm
AlgoTwopi.json   Grid     3 Network  expand_view ce169474157a 20n 0c 0nest 0rm
AlgoTwopi.json   Grid     3 Network  layout_only ce169474157a 20n 0c 0nest 0rm
AlgoTwopi.json   Pack     1 Nesting  new_view    8d2a22029793 15n 0c 0nest 0rm
AlgoTwopi.json   Pack     1 Nesting  expand_view ac57d57ca758 14n 0c 0nest 0rm
AlgoTwopi.json   Pack     1 Nesting  layout_only ac57d57ca758 14n 0c 0nest 0rm
AlgoTwopi.json   Pack     2 Edited   new_view    76cfbdc9d404 17n 0c 0nest 0rm
AlgoTwopi.json   Pack     2 Edited   expand_view 99c1cf9f07ef 15n 0c 0nest 1rm
AlgoTwopi.json   Pack     2 Edited   layout_only 99c1cf9f07ef 15n 0c 0nest 1rm
AlgoTwopi.json   Pack     3 Network  new_view    fe620662c272 20n 0c 0nest 0rm
AlgoTwopi.json   Pack     3 Network  expand_view 5313076a39c1 20n 0c 0nest 0rm
AlgoTwopi.json   Pack     3 Network  layout_only 5313076a39c1 20n 0c 0nest 0rm
AlgoTwopi.json   Dagre    1 Nesting  new_view    0d9ac20b5a64 15n 14c 0nest 0rm
AlgoTwopi.json   Dagre    1 Nesting  expand_view f00a3f149b81 14n 13c 0nest 0rm
AlgoTwopi.json   Dagre    1 Nesting  layout_only f00a3f149b81 14n 13c 0nest 0rm
AlgoTwopi.json   Dagre    2 Edited   new_view    20f99d90315f 17n 15c 0nest 0rm
AlgoTwopi.json   Dagre    2 Edited   expand_view 7de23b00bfb9 15n 15c 0nest 1rm
AlgoTwopi.json   Dagre    2 Edited   layout_only 7de23b00bfb9 15n 15c 0nest 1rm
AlgoTwopi.json   Dagre    3 Network  new_view    efdfe711751b 20n 21c 0nest 0rm
AlgoTwopi.json   Dagre    3 Network  expand_view 8e8bfe6c320e 20n 21c 0nest 0rm
AlgoTwopi.json   Dagre    3 Network  layout_only 8e8bfe6c320e 20n 21c 0nest 0rm
AlgoTwopi.json   Dot      1 Nesting  new_view    c72498121c66 15n 14c 0nest 0rm
AlgoTwopi.json   Dot      1 Nesting  expand_view f86db2ae3c3a 14n 13c 0nest 0rm
AlgoTwopi.json   Dot      1 Nesting  layout_only f86db2ae3c3a 14n 13c 0nest 0rm
AlgoTwopi.json   Dot      2 Edited   new_view    4134e2ed85fc 17n 15c 0nest 0rm
AlgoTwopi.json   Dot      2 Edited   expand_view 9e843f7eb3ba 15n 15c 0nest 1rm
AlgoTwopi.json   Dot      2 Edited   layout_only 9e843f7eb3ba 15n 15c 0nest 1rm
AlgoTwopi.json   Dot      3 Network  new_view    f3a685d18694 20n 21c 0nest 0rm
AlgoTwopi.json   Dot      3 Network  expand_view 841a0d07f34b 20n 21c 0nest 0rm
AlgoTwopi.json   Dot      3 Network  layout_only 841a0d07f34b 20n 21c 0nest 0rm
AlgoTwopi.json   Neato    1 Nesting  new_view    7e270853f84d 15n 14c 0nest 0rm
AlgoTwopi.json   Neato    1 Nesting  expand_view c087f1f72d6d 14n 13c 0nest 0rm
AlgoTwopi.json   Neato    1 Nesting  layout_only c087f1f72d6d 14n 13c 0nest 0rm
AlgoTwopi.json   Neato    2 Edited   new_view    9e707dab94bc 17n 15c 0nest 0rm
AlgoTwopi.json   Neato    2 Edited   expand_view f76a62645bae 15n 15c 0nest 1rm
AlgoTwopi.json   Neato    2 Edited   layout_only f76a62645bae 15n 15c 0nest 1rm
AlgoTwopi.json   Neato    3 Network  new_view    ab7b93f648dd 20n 21c 0nest 0rm
AlgoTwopi.json   Neato    3 Network  expand_view 41c6ac222904 20n 21c 0nest 0rm
AlgoTwopi.json   Neato    3 Network  layout_only 41c6ac222904 20n 21c 0nest 0rm
AlgoTwopi.json   FDP      1 Nesting  new_view    07207161097c 15n 14c 0nest 0rm
AlgoTwopi.json   FDP      1 Nesting  expand_view 0c2a21d40b08 14n 13c 0nest 0rm
AlgoTwopi.json   FDP      1 Nesting  layout_only 0c2a21d40b08 14n 13c 0nest 0rm
AlgoTwopi.json   FDP      2 Edited   new_view    497dba51fd0e 17n 15c 0nest 0rm
AlgoTwopi.json   FDP      2 Edited   expand_view aa35e8c5a3b3 15n 15c 0nest 1rm
AlgoTwopi.json   FDP      2 Edited   layout_only aa35e8c5a3b3 15n 15c 0nest 1rm
AlgoTwopi.json   FDP      3 Network  new_view    5e5d1862299e 20n 21c 0nest 0rm
AlgoTwopi.json   FDP      3 Network  expand_view b2fba8d82c43 20n 21c 0nest 0rm
AlgoTwopi.json   FDP      3 Network  layout_only b2fba8d82c43 20n 21c 0nest 0rm
AlgoTwopi.json   SFDP     1 Nesting  new_view    0ff260f32fc7 15n 14c 0nest 0rm
AlgoTwopi.json   SFDP     1 Nesting  expand_view a03edf699864 14n 13c 0nest 0rm
AlgoTwopi.json   SFDP     1 Nesting  layout_only a03edf699864 14n 13c 0nest 0rm
AlgoTwopi.json   SFDP     2 Edited   new_view    17efec5c31b7 17n 15c 0nest 0rm
AlgoTwopi.json   SFDP     2 Edited   expand_view 97f8ea9aad53 15n 15c 0nest 1rm
AlgoTwopi.json   SFDP     2 Edited   layout_only 97f8ea9aad53 15n 15c 0nest 1rm
AlgoTwopi.json   SFDP     3 Network  new_view    9b3ad72718df 20n 21c 0nest 0rm
AlgoTwopi.json   SFDP     3 Network  expand_view 0244dd9ab05f 20n 21c 0nest 0rm
AlgoTwopi.json   SFDP     3 Network  layout_only 0244dd9ab05f 20n 21c 0nest 0rm
AlgoTwopi.json   Twopi    1 Nesting  new_view    a13a25fdfebc 15n 14c 0nest 0rm
AlgoTwopi.json   Twopi    1 Nesting  expand_view 9fa7d226852d 14n 13c 0nest 0rm
AlgoTwopi.json   Twopi    1 Nesting  layout_only 9fa7d226852d 14n 13c 0nest 0rm
AlgoTwopi.json   Twopi    2 Edited   new_view    c2074c140a65 17n 15c 0nest 0rm
AlgoTwopi.json   Twopi    2 Edited   expand_view e3d1f8e76a2a 15n 15c 0nest 1rm
AlgoTwopi.json   Twopi    2 Edited   layout_only e3d1f8e76a2a 15n 15c 0nest 1rm
AlgoTwopi.json   Twopi    3 Network  new_view    a89ebe0961da 20n 21c 0nest 0rm
AlgoTwopi.json   Twopi    3 Network  expand_view 2793ad1dfb15 20n 21c 0nest 0rm
AlgoTwopi.json   Twopi    3 Network  layout_only 2793ad1dfb15 20n 21c 0nest 0rm
AlgoTwopi.json   Circo    1 Nesting  new_view    9824fd09bd30 15n 14c 0nest 0rm
AlgoTwopi.json   Circo    1 Nesting  expand_view b822bf51d6c7 14n 13c 0nest 0rm
AlgoTwopi.json   Circo    1 Nesting  layout_only b822bf51d6c7 14n 13c 0nest 0rm
AlgoTwopi.json   Circo    2 Edited   new_view    984a98fdf9b7 17n 15c 0nest 0rm
AlgoTwopi.json   Circo    2 Edited   expand_view ad902a5d14f3 15n 15c 0nest 1rm
AlgoTwopi.json   Circo    2 Edited   layout_only ad902a5d14f3 15n 15c 0nest 1rm
AlgoTwopi.json   Circo    3 Network  new_view    16246cb13baf 20n 21c 0nest 0rm
AlgoTwopi.json   Circo    3 Network  expand_view 1dff1e735288 20n 21c 0nest 0rm
AlgoTwopi.json   Circo    3 Network  layout_only 1dff1e735288 20n 21c 0nest 0rm
baseline.json    Layered  1 Nesting  new_view    89fe703a995c 16n 8c 6nest 0rm
baseline.json    Layered  1 Nesting  expand_view c639f7b7478b 15n 8c 6nest 0rm
baseline.json    Layered  1 Nesting  layout_only 199419313f4e 15n 7c 6nest 0rm
baseline.json    Layered  2 Edited   new_view    dad3c762ed84 19n 10c 6nest 0rm
baseline.json    Layered  2 Edited   expand_view 55bac5803588 17n 10c 6nest 0rm
baseline.json    Layered  2 Edited   layout_only 152dbc77b2b6 16n 9c 6nest 0rm
baseline.json    Layered  3 Network  new_view    14570a0d27b2 20n 21c 0nest 0rm
baseline.json    Layered  3 Network  expand_view 7e38088027d8 20n 21c 0nest 0rm
baseline.json    Layered  3 Network  layout_only 7e38088027d8 20n 21c 0nest 0rm
baseline.json    Tree     1 Nesting  new_view    136c57185671 16n 7c 6nest 0rm
baseline.json    Tree     1 Nesting  expand_view ea3e24ee8ae3 15n 7c 6nest 0rm
baseline.json    Tree     1 Nesting  layout_only 2f23403817c7 15n 6c 6nest 0rm
baseline.json    Tree     2 Edited   new_view    8a87de264b15 19n 9c 6nest 0rm
baseline.json    Tree     2 Edited   expand_view 928149b0b18b 17n 9c 6nest 0rm
baseline.json    Tree     2 Edited   layout_only 39e5beef668b 16n 8c 6nest 0rm
baseline.json    Tree     3 Network  new_view    063015f7a6ec 20n 21c 0nest 0rm
baseline.json    Tree     3 Network  expand_view d9c17cd1a116 20n 21c 0nest 0rm
baseline.json    Tree     3 Network  layout_only d9c17cd1a116 20n 21c 0nest 0rm
baseline.json    Stress   1 Nesting  new_view    699d485acd4a 15n 13c 0nest 0rm
baseline.json    Stress   1 Nesting  expand_view ee3660d91f5b 14n 13c 0nest 0rm
baseline.json    Stress   1 Nesting  layout_only ef2ed7f8cb11 14n 12c 0nest 0rm
baseline.json    Stress   2 Edited   new_view    67edd5a29383 18n 15c 0nest 0rm
baseline.json    Stress   2 Edited   expand_view 29765703fb85 16n 15c 0nest 1rm
baseline.json    Stress   2 Edited   layout_only 86d79c5b643a 15n 14c 0nest 1rm
baseline.json    Stress   3 Network  new_view    70786b158123 20n 21c 0nest 0rm
baseline.json    Stress   3 Network  expand_view 65bc4bdc8851 20n 21c 0nest 0rm
baseline.json    Stress   3 Network  layout_only 65bc4bdc8851 20n 21c 0nest 0rm
baseline.json    Radial   1 Nesting  new_view    7bfb8e353aca 15n 11c 0nest 0rm
baseline.json    Radial   1 Nesting  expand_view 558b3ca64556 14n 11c 0nest 0rm
baseline.json    Radial   1 Nesting  layout_only 7558c1e6eda6 14n 10c 0nest 0rm
baseline.json    Radial   2 Edited   new_view    fb98f48b40ce 18n 13c 0nest 0rm
baseline.json    Radial   2 Edited   expand_view 3186e902cb95 16n 13c 0nest 1rm
baseline.json    Radial   2 Edited   layout_only ec63b318c299 15n 12c 0nest 1rm
baseline.json    Radial   3 Network  new_view    b1e1aaa56aef 20n 18c 0nest 0rm
baseline.json    Radial   3 Network  expand_view 0a8c83bf6139 20n 18c 0nest 0rm
baseline.json    Radial   3 Network  layout_only 0a8c83bf6139 20n 18c 0nest 0rm
baseline.json    Grid     1 Nesting  new_view    022ef5978738 16n 0c 6nest 0rm
baseline.json    Grid     1 Nesting  expand_view d764a805f150 15n 0c 6nest 0rm
baseline.json    Grid     1 Nesting  layout_only d764a805f150 15n 0c 6nest 0rm
baseline.json    Grid     2 Edited   new_view    aa9295caf476 19n 0c 6nest 0rm
baseline.json    Grid     2 Edited   expand_view e524059283c7 17n 0c 6nest 0rm
baseline.json    Grid     2 Edited   layout_only 54a3fcf14ae2 16n 0c 6nest 0rm
baseline.json    Grid     3 Network  new_view    8e66823f2fa0 20n 0c 0nest 0rm
baseline.json    Grid     3 Network  expand_view a276c8a162fd 20n 0c 0nest 0rm
baseline.json    Grid     3 Network  layout_only a276c8a162fd 20n 0c 0nest 0rm
baseline.json    Pack     1 Nesting  new_view    e956a5c388d0 16n 0c 6nest 0rm
baseline.json    Pack     1 Nesting  expand_view 947392301894 15n 0c 6nest 0rm
baseline.json    Pack     1 Nesting  layout_only 947392301894 15n 0c 6nest 0rm
baseline.json    Pack     2 Edited   new_view    b9b01859128f 19n 0c 6nest 0rm
baseline.json    Pack     2 Edited   expand_view 149f66f9a2f6 17n 0c 6nest 0rm
baseline.json    Pack     2 Edited   layout_only 274e6ca45e74 16n 0c 6nest 0rm
baseline.json    Pack     3 Network  new_view    22d159e09e31 20n 0c 0nest 0rm
baseline.json    Pack     3 Network  expand_view 253727dd1c12 20n 0c 0nest 0rm
baseline.json    Pack     3 Network  layout_only 253727dd1c12 20n 0c 0nest 0rm
baseline.json    Dagre    1 Nesting  new_view    cbe04a312818 16n 8c 6nest 0rm
baseline.json    Dagre    1 Nesting  expand_view 94b6a8dd54b1 15n 8c 6nest 0rm
baseline.json    Dagre    1 Nesting  layout_only 2bdb314f6b85 15n 7c 6nest 0rm
baseline.json    Dagre    2 Edited   new_view    ecfc30950b04 19n 10c 6nest 0rm
baseline.json    Dagre    2 Edited   expand_view 064cbd3ccfe3 17n 10c 6nest 0rm
baseline.json    Dagre    2 Edited   layout_only 602d2b7c33dd 16n 9c 6nest 0rm
baseline.json    Dagre    3 Network  new_view    0a2d22ad2f10 20n 21c 0nest 0rm
baseline.json    Dagre    3 Network  expand_view c55bdcafb87c 20n 21c 0nest 0rm
baseline.json    Dagre    3 Network  layout_only c55bdcafb87c 20n 21c 0nest 0rm
baseline.json    Dot      1 Nesting  new_view    f78d12723ff0 16n 8c 6nest 0rm
baseline.json    Dot      1 Nesting  expand_view 0a2882a234f7 15n 8c 6nest 0rm
baseline.json    Dot      1 Nesting  layout_only fee655f4f4d2 15n 7c 6nest 0rm
baseline.json    Dot      2 Edited   new_view    d16304f4974e 19n 10c 6nest 0rm
baseline.json    Dot      2 Edited   expand_view f1287955c80d 17n 10c 6nest 0rm
baseline.json    Dot      2 Edited   layout_only 3e3ec2316de1 16n 9c 6nest 0rm
baseline.json    Dot      3 Network  new_view    0d299afa6699 20n 21c 0nest 0rm
baseline.json    Dot      3 Network  expand_view 550b33daf6d4 20n 21c 0nest 0rm
baseline.json    Dot      3 Network  layout_only 550b33daf6d4 20n 21c 0nest 0rm
baseline.json    Neato    1 Nesting  new_view    22a6609607be 15n 14c 0nest 0rm
baseline.json    Neato    1 Nesting  expand_view 04b93ffe6b0c 14n 14c 0nest 0rm
baseline.json    Neato    1 Nesting  layout_only 70f4276181dd 14n 13c 0nest 0rm
baseline.json    Neato    2 Edited   new_view    1a29fbb7afd0 18n 16c 0nest 0rm
baseline.json    Neato    2 Edited   expand_view 91b4b08f91cf 16n 16c 0nest 1rm
baseline.json    Neato    2 Edited   layout_only 67a905a51582 15n 15c 0nest 1rm
baseline.json    Neato    3 Network  new_view    1842a8ad2957 20n 21c 0nest 0rm
baseline.json    Neato    3 Network  expand_view ea2d1cf20830 20n 21c 0nest 0rm
baseline.json    Neato    3 Network  layout_only ea2d1cf20830 20n 21c 0nest 0rm
baseline.json    FDP      1 Nesting  new_view    5b7271d8ae8e 16n 8c 6nest 0rm
baseline.json    FDP      1 Nesting  expand_view 4692d93b7845 15n 8c 6nest 0rm
baseline.json    FDP      1 Nesting  layout_only 605193644394 15n 7c 6nest 0rm
baseline.json    FDP      2 Edited   new_view    7332da042c9f 19n 10c 6nest 0rm
baseline.json    FDP      2 Edited   expand_view 6e30dfd62055 17n 10c 6nest 0rm
baseline.json    FDP      2 Edited   layout_only 629cf8d70118 16n 9c 6nest 0rm
baseline.json    FDP      3 Network  new_view    7f8b809508cc 20n 21c 0nest 0rm
baseline.json    FDP      3 Network  expand_view b0bbf9d032bb 20n 21c 0nest 0rm
baseline.json    FDP      3 Network  layout_only b0bbf9d032bb 20n 21c 0nest 0rm
baseline.json    SFDP     1 Nesting  new_view    36167198e498 15n 14c 0nest 0rm
baseline.json    SFDP     1 Nesting  expand_view 5d7e984a26af 14n 14c 0nest 0rm
baseline.json    SFDP     1 Nesting  layout_only 7db8a6904409 14n 13c 0nest 0rm
baseline.json    SFDP     2 Edited   new_view    86698679dda2 18n 16c 0nest 0rm
baseline.json    SFDP     2 Edited   expand_view 665d047e3b38 16n 16c 0nest 1rm
baseline.json    SFDP     2 Edited   layout_only 9e21f40dd421 15n 15c 0nest 1rm
baseline.json    SFDP     3 Network  new_view    55d2bbdf6305 20n 21c 0nest 0rm
baseline.json    SFDP     3 Network  expand_view 06f6e5cf7895 20n 21c 0nest 0rm
baseline.json    SFDP     3 Network  layout_only 06f6e5cf7895 20n 21c 0nest 0rm
baseline.json    Twopi    1 Nesting  new_view    1ba1207bdae8 15n 14c 0nest 0rm
baseline.json    Twopi    1 Nesting  expand_view 18589a9d6bf7 14n 14c 0nest 0rm
baseline.json    Twopi    1 Nesting  layout_only 6c74206cc717 14n 13c 0nest 0rm
baseline.json    Twopi    2 Edited   new_view    d0b5ef456478 18n 16c 0nest 0rm
baseline.json    Twopi    2 Edited   expand_view 46ed1a2014b4 16n 16c 0nest 1rm
baseline.json    Twopi    2 Edited   layout_only 0b232a2e65dd 15n 15c 0nest 1rm
baseline.json    Twopi    3 Network  new_view    90651bf7925f 20n 21c 0nest 0rm
baseline.json    Twopi    3 Network  expand_view da30469178cb 20n 21c 0nest 0rm
baseline.json    Twopi    3 Network  layout_only da30469178cb 20n 21c 0nest 0rm
baseline.json    Circo    1 Nesting  new_view    156a03771bc5 15n 14c 0nest 0rm
baseline.json    Circo    1 Nesting  expand_view 19c90e034552 14n 14c 0nest 0rm
baseline.json    Circo    1 Nesting  layout_only a1feccdccd75 14n 13c 0nest 0rm
baseline.json    Circo    2 Edited   new_view    7415807364cc 18n 16c 0nest 0rm
baseline.json    Circo    2 Edited   expand_view 1e7912a10efe 16n 16c 0nest 1rm
baseline.json    Circo    2 Edited   layout_only 28dede3443b9 15n 15c 0nest 1rm
baseline.json    Circo    3 Network  new_view    6f286797931f 20n 21c 0nest 0rm
baseline.json    Circo    3 Network  expand_view 8b59831a259a 20n 21c 0nest 0rm
baseline.json    Circo    3 Network  layout_only 8b59831a259a 20n 21c 0nest 0rm
counters.json    Layered  1 Nesting  new_view    89fe703a995c 16n 8c 6nest 0rm
counters.json    Layered  1 Nesting  expand_view c639f7b7478b 15n 8c 6nest 0rm
counters.json    Layered  1 Nesting  layout_only 199419313f4e 15n 7c 6nest 0rm
counters.json    Layered  2 Edited   new_view    dad3c762ed84 19n 10c 6nest 0rm
counters.json    Layered  2 Edited   expand_view 55bac5803588 17n 10c 6nest 0rm
counters.json    Layered  2 Edited   layout_only 152dbc77b2b6 16n 9c 6nest 0rm
counters.json    Layered  3 Network  new_view    14570a0d27b2 20n 21c 0nest 0rm
counters.json    Layered  3 Network  expand_view 7e38088027d8 20n 21c 0nest 0rm
counters.json    Layered  3 Network  layout_only 7e38088027d8 20n 21c 0nest 0rm
counters.json    Tree     1 Nesting  new_view    136c57185671 16n 7c 6nest 0rm
counters.json    Tree     1 Nesting  expand_view ea3e24ee8ae3 15n 7c 6nest 0rm
counters.json    Tree     1 Nesting  layout_only 2f23403817c7 15n 6c 6nest 0rm
counters.json    Tree     2 Edited   new_view    8a87de264b15 19n 9c 6nest 0rm
counters.json    Tree     2 Edited   expand_view 928149b0b18b 17n 9c 6nest 0rm
counters.json    Tree     2 Edited   layout_only 39e5beef668b 16n 8c 6nest 0rm
counters.json    Tree     3 Network  new_view    063015f7a6ec 20n 21c 0nest 0rm
counters.json    Tree     3 Network  expand_view d9c17cd1a116 20n 21c 0nest 0rm
counters.json    Tree     3 Network  layout_only d9c17cd1a116 20n 21c 0nest 0rm
counters.json    Stress   1 Nesting  new_view    699d485acd4a 15n 13c 0nest 0rm
counters.json    Stress   1 Nesting  expand_view ee3660d91f5b 14n 13c 0nest 0rm
counters.json    Stress   1 Nesting  layout_only ef2ed7f8cb11 14n 12c 0nest 0rm
counters.json    Stress   2 Edited   new_view    67edd5a29383 18n 15c 0nest 0rm
counters.json    Stress   2 Edited   expand_view 29765703fb85 16n 15c 0nest 1rm
counters.json    Stress   2 Edited   layout_only 86d79c5b643a 15n 14c 0nest 1rm
counters.json    Stress   3 Network  new_view    70786b158123 20n 21c 0nest 0rm
counters.json    Stress   3 Network  expand_view 65bc4bdc8851 20n 21c 0nest 0rm
counters.json    Stress   3 Network  layout_only 65bc4bdc8851 20n 21c 0nest 0rm
counters.json    Radial   1 Nesting  new_view    7bfb8e353aca 15n 11c 0nest 0rm
counters.json    Radial   1 Nesting  expand_view 558b3ca64556 14n 11c 0nest 0rm
counters.json    Radial   1 Nesting  layout_only 7558c1e6eda6 14n 10c 0nest 0rm
counters.json    Radial   2 Edited   new_view    fb98f48b40ce 18n 13c 0nest 0rm
counters.json    Radial   2 Edited   expand_view 3186e902cb95 16n 13c 0nest 1rm
counters.json    Radial   2 Edited   layout_only ec63b318c299 15n 12c 0nest 1rm
counters.json    Radial   3 Network  new_view    b1e1aaa56aef 20n 18c 0nest 0rm
counters.json    Radial   3 Network  expand_view 0a8c83bf6139 20n 18c 0nest 0rm
counters.json    Radial   3 Network  layout_only 0a8c83bf6139 20n 18c 0nest 0rm
counters.json    Grid     1 Nesting  new_view    022ef5978738 16n 0c 6nest 0rm
counters.json    Grid     1 Nesting  expand_view d764a805f150 15n 0c 6nest 0rm
counters.json    Grid     1 Nesting  layout_only d764a805f150 15n 0c 6nest 0rm
counters.json    Grid     2 Edited   new_view    aa9295caf476 19n 0c 6nest 0rm
counters.json    Grid     2 Edited   expand_view e524059283c7 17n 0c 6nest 0rm
counters.json    Grid     2 Edited   layout_only 54a3fcf14ae2 16n 0c 6nest 0rm
counters.json    Grid     3 Network  new_view    8e66823f2fa0 20n 0c 0nest 0rm
counters.json    Grid     3 Network  expand_view a276c8a162fd 20n 0c 0nest 0rm
counters.json    Grid     3 Network  layout_only a276c8a162fd 20n 0c 0nest 0rm
counters.json    Pack     1 Nesting  new_view    e956a5c388d0 16n 0c 6nest 0rm
counters.json    Pack     1 Nesting  expand_view 947392301894 15n 0c 6nest 0rm
counters.json    Pack     1 Nesting  layout_only 947392301894 15n 0c 6nest 0rm
counters.json    Pack     2 Edited   new_view    b9b01859128f 19n 0c 6nest 0rm
counters.json    Pack     2 Edited   expand_view 149f66f9a2f6 17n 0c 6nest 0rm
counters.json    Pack     2 Edited   layout_only 274e6ca45e74 16n 0c 6nest 0rm
counters.json    Pack     3 Network  new_view    22d159e09e31 20n 0c 0nest 0rm
counters.json    Pack     3 Network  expand_view 253727dd1c12 20n 0c 0nest 0rm
counters.json    Pack     3 Network  layout_only 253727dd1c12 20n 0c 0nest 0rm
counters.json    Dagre    1 Nesting  new_view    cbe04a312818 16n 8c 6nest 0rm
counters.json    Dagre    1 Nesting  expand_view 94b6a8dd54b1 15n 8c 6nest 0rm
counters.json    Dagre    1 Nesting  layout_only 2bdb314f6b85 15n 7c 6nest 0rm
counters.json    Dagre    2 Edited   new_view    ecfc30950b04 19n 10c 6nest 0rm
counters.json    Dagre    2 Edited   expand_view 064cbd3ccfe3 17n 10c 6nest 0rm
counters.json    Dagre    2 Edited   layout_only 602d2b7c33dd 16n 9c 6nest 0rm
counters.json    Dagre    3 Network  new_view    0a2d22ad2f10 20n 21c 0nest 0rm
counters.json    Dagre    3 Network  expand_view c55bdcafb87c 20n 21c 0nest 0rm
counters.json    Dagre    3 Network  layout_only c55bdcafb87c 20n 21c 0nest 0rm
counters.json    Dot      1 Nesting  new_view    f78d12723ff0 16n 8c 6nest 0rm
counters.json    Dot      1 Nesting  expand_view 0a2882a234f7 15n 8c 6nest 0rm
counters.json    Dot      1 Nesting  layout_only fee655f4f4d2 15n 7c 6nest 0rm
counters.json    Dot      2 Edited   new_view    d16304f4974e 19n 10c 6nest 0rm
counters.json    Dot      2 Edited   expand_view f1287955c80d 17n 10c 6nest 0rm
counters.json    Dot      2 Edited   layout_only 3e3ec2316de1 16n 9c 6nest 0rm
counters.json    Dot      3 Network  new_view    0d299afa6699 20n 21c 0nest 0rm
counters.json    Dot      3 Network  expand_view 550b33daf6d4 20n 21c 0nest 0rm
counters.json    Dot      3 Network  layout_only 550b33daf6d4 20n 21c 0nest 0rm
counters.json    Neato    1 Nesting  new_view    22a6609607be 15n 14c 0nest 0rm
counters.json    Neato    1 Nesting  expand_view 04b93ffe6b0c 14n 14c 0nest 0rm
counters.json    Neato    1 Nesting  layout_only 70f4276181dd 14n 13c 0nest 0rm
counters.json    Neato    2 Edited   new_view    1a29fbb7afd0 18n 16c 0nest 0rm
counters.json    Neato    2 Edited   expand_view 91b4b08f91cf 16n 16c 0nest 1rm
counters.json    Neato    2 Edited   layout_only 67a905a51582 15n 15c 0nest 1rm
counters.json    Neato    3 Network  new_view    1842a8ad2957 20n 21c 0nest 0rm
counters.json    Neato    3 Network  expand_view ea2d1cf20830 20n 21c 0nest 0rm
counters.json    Neato    3 Network  layout_only ea2d1cf20830 20n 21c 0nest 0rm
counters.json    FDP      1 Nesting  new_view    5b7271d8ae8e 16n 8c 6nest 0rm
counters.json    FDP      1 Nesting  expand_view 4692d93b7845 15n 8c 6nest 0rm
counters.json    FDP      1 Nesting  layout_only 605193644394 15n 7c 6nest 0rm
counters.json    FDP      2 Edited   new_view    7332da042c9f 19n 10c 6nest 0rm
counters.json    FDP      2 Edited   expand_view 6e30dfd62055 17n 10c 6nest 0rm
counters.json    FDP      2 Edited   layout_only 629cf8d70118 16n 9c 6nest 0rm
counters.json    FDP      3 Network  new_view    7f8b809508cc 20n 21c 0nest 0rm
counters.json    FDP      3 Network  expand_view b0bbf9d032bb 20n 21c 0nest 0rm
counters.json    FDP      3 Network  layout_only b0bbf9d032bb 20n 21c 0nest 0rm
counters.json    SFDP     1 Nesting  new_view    36167198e498 15n 14c 0nest 0rm
counters.json    SFDP     1 Nesting  expand_view 5d7e984a26af 14n 14c 0nest 0rm
counters.json    SFDP     1 Nesting  layout_only 7db8a6904409 14n 13c 0nest 0rm
counters.json    SFDP     2 Edited   new_view    86698679dda2 18n 16c 0nest 0rm
counters.json    SFDP     2 Edited   expand_view 665d047e3b38 16n 16c 0nest 1rm
counters.json    SFDP     2 Edited   layout_only 9e21f40dd421 15n 15c 0nest 1rm
counters.json    SFDP     3 Network  new_view    55d2bbdf6305 20n 21c 0nest 0rm
counters.json    SFDP     3 Network  expand_view 06f6e5cf7895 20n 21c 0nest 0rm
counters.json    SFDP     3 Network  layout_only 06f6e5cf7895 20n 21c 0nest 0rm
counters.json    Twopi    1 Nesting  new_view    1ba1207bdae8 15n 14c 0nest 0rm
counters.json    Twopi    1 Nesting  expand_view 18589a9d6bf7 14n 14c 0nest 0rm
counters.json    Twopi    1 Nesting  layout_only 6c74206cc717 14n 13c 0nest 0rm
counters.json    Twopi    2 Edited   new_view    d0b5ef456478 18n 16c 0nest 0rm
counters.json    Twopi    2 Edited   expand_view 46ed1a2014b4 16n 16c 0nest 1rm
counters.json    Twopi    2 Edited   layout_only 0b232a2e65dd 15n 15c 0nest 1rm
counters.json    Twopi    3 Network  new_view    90651bf7925f 20n 21c 0nest 0rm
counters.json    Twopi    3 Network  expand_view da30469178cb 20n 21c 0nest 0rm
counters.json    Twopi    3 Network  layout_only da30469178cb 20n 21c 0nest 0rm
counters.json    Circo    1 Nesting  new_view    156a03771bc5 15n 14c 0nest 0rm
counters.json    Circo    1 Nesting  expand_view 19c90e034552 14n 14c 0nest 0rm
counters.json    Circo    1 Nesting  layout_only a1feccdccd75 14n 13c 0nest 0rm
counters.json    Circo    2 Edited   new_view    7415807364cc 18n 16c 0nest 0rm
counters.json    Circo    2 Edited   expand_view 1e7912a10efe 16n 16c 0nest 1rm
counters.json    Circo    2 Edited   layout_only 28dede3443b9 15n 15c 0nest 1rm
counters.json    Circo    3 Network  new_view    6f286797931f 20n 21c 0nest 0rm
counters.json    Circo    3 Network  expand_view 8b59831a259a 20n 21c 0nest 0rm
counters.json    Circo    3 Network  layout_only 8b59831a259a 20n 21c 0nest 0rm
```
