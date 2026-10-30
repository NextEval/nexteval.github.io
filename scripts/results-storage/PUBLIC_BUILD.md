# Three-Seed Primary Numerical Results

181 groups, 92 problems times original seed ordinals 0, 1, 2. The 179 groups of the primary179 release are unchanged as records; this release adds:

- Fable 5.1 Claude Code high on Noisy, from SYU Harbor trials (one formal attempt per identity, as for every published campaign group). Fable 5.1 high now covers Perturbed and Noisy; its Rotated and RandomNaN groups are incomplete because the account's weekly quota stopped the campaign, and stay unscored.
- GLM-5.3 Claude Code high on Noisy: the 166 tasks returned in research PR39 plus 110 disjoint earlier SYU records of the same configuration with matching x0. The earlier records set max_output_tokens=32000, as in the PR37 Claude Code backfills.

Noisy is recomputed with OptiProfiler 1.3.4 over the enlarged comparison, so existing Noisy scores move slightly (at most 0.009). Failures and timeouts remain in the denominator. HY4 Preview is not tested in this campaign: it is removed from the plan and its single incomplete record stays unscored.

Usage is repriced with the 2026-10-30 official standard price snapshot `public-standard-20261030-r2`. Rows from the 2026-10-09 snapshot were re-checked and are unchanged; displayed models missing from that snapshot were added from official pages; DeepSeek uses the standard peak rate instead of the off-peak discount, and Qwen 3.8 Max uses the Beijing region rate. 154 exact-token and 154 exact-cost groups; the other 27 groups have a labelled estimate in the separate `estimates` block, and their exact fields stay null. The website plots every displayed configuration with exact or estimated usage under one Pareto frontier (Perturbed/Noisy/Rotated/RandomNaN: 43/43/42/42, equal to the score matrix). Original scientific bundles stay private in HF. Git holds the exact public artifact manifest and small source/tests; raw native text, credentials, hidden reasoning and submitted point vectors are not public.

Private HF revision: 0d90f91948cb58b0a27d6c4484b4da4f6be4e5d2
