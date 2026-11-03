# Three-Seed Primary Numerical Results

182 groups, 92 problems times original seed ordinals 0, 1, 2. The 181 groups of the primary181 release are unchanged as records; this release (`web-primary182-fable-rotated-20261104`) adds:

- Fable 5.1 Claude Code high on Rotated, from SYU Harbor trials (one formal attempt per identity, as for every published campaign group; 123 agent completions and 153 budget exhaustions, no failures). 130 attempts ran on 2026-10-30 and 146 on 2026-11-03 (UTC) in the same campaign scope, resumed from the existing attempts after the weekly quota reset; the records come from the copy-only archive `syu-fable-harbor-20261104-R`. From 2026-11-03T15:17Z the campaign controller accepted usage samples without the 5-hour session item, which the usage endpoint no longer reported; the change affected scheduling only, not the plan, bench, harness or evaluator. Fable 5.1 high now covers Perturbed, Noisy and Rotated; its RandomNaN group is incomplete and stays unscored.

Rotated is recomputed with OptiProfiler 1.3.4 over the enlarged comparison, so existing Rotated scores move slightly (at most 0.005); Perturbed, Noisy and RandomNaN are unchanged. Failures and timeouts remain in the denominator.

primary181 added Fable 5.1 Claude Code high on Noisy and GLM-5.3 Claude Code high on Noisy (the 166 tasks returned in research PR39 plus 110 disjoint earlier SYU records of the same configuration with matching x0; the earlier records set max_output_tokens=32000, as in the PR37 Claude Code backfills). HY4 Preview is not tested in this campaign: it is removed from the plan and its single incomplete record stays unscored.

Usage is priced with the 2026-10-30 official standard price snapshot `public-standard-20261030-r2` (unchanged since primary181). Rows from the 2026-10-09 snapshot were re-checked and are unchanged; displayed models missing from that snapshot were added from official pages; DeepSeek uses the standard peak rate instead of the off-peak discount, and Qwen 3.8 Max uses the Beijing region rate. 155 exact-token and 155 exact-cost groups; the other 27 groups have a labelled estimate in the separate `estimates` block, and their exact fields stay null. The website plots every displayed configuration with exact or estimated usage under one Pareto frontier (Perturbed/Noisy/Rotated/RandomNaN: 43/43/43/42, equal to the score matrix). Original scientific bundles stay private in HF. Git holds the exact public artifact manifest and small source/tests; raw native text, credentials, hidden reasoning and submitted point vectors are not public. The full-view GitHub release is a draft from the start (authenticated download only), as primary181 has been since 2026-10-31.

Private HF revision: c70603e31d579257890da1f2d9c526a92fe6a780

## Pages deploy (slim site)

Pages no longer hydrates or deploys this full view. `node scripts/site/build-site.mjs` builds `_site/` and the deploy uploads only `_site/`:

- tracked files under an allowlist: the root pages (`index.html`, `site.css`, `site.js`, `slogan.css`, `navigation.js`), `solver/`, `site-assets/`, `bench/index.html`, the `bench/archive.html` and `bench/ten-repeat.html` redirects, `bench/vendor/` and `bench/assets/brand/`;
- `bench/results/` from the slim release pinned in `bench/results-source.json`: the only asset of GitHub release `site-primary182-fable-rotated-20261104` (public, no token), checked file by file against the pinned sha256 values. The same files are in the private HF dataset `NextEval/nexteval-bench-web` at the pinned revision.

The slim bundle is built in the website repository (`scripts/results-storage/site_projection.py`, see its `PUBLIC_BUILD.md`). It keeps the result views and drops downloads, evidence, provenance, the ten-repeat archive, historical-assisted data, `usage-estimates.html`, the price snapshot and node check scripts. `scripts/`, `test/`, `audit/`, legacy `bench/` JavaScript and CSS and the old `bench/assets/` curves are not deployed. The overlay scripts in this directory are the record of the full-view build and are not used by the Pages build.
