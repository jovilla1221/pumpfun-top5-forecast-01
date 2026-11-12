# PumpFun Top-5 Forecast — entry

A horizon-aware trajectory forecast for make.fun's `pumpfun-top5-forecast-01`:
predict the 5 largest new pump.fun coins by market cap at seven answer reads.

`main.ts` (Node 22, standard library only, no network, deterministic) reads
`task.json` and `history.ndjson` from `$MAKEFUN_INPUT_DIR` (default `/input`)
and writes `forecast.json` to `$MAKEFUN_OUTPUT_DIR` (default `/output`).

Model, in short:

- Per coin: recency-weighted slope of log10 market cap across all marks,
  extrapolated to the middle of the answer window with exponential damping,
  adjusted for venue/graduation, volatility and stale age.
- Place probabilities: Plackett-Luce cascade over the projected caps, with a
  temperature that widens with the horizon; an unnamed share per place that
  grows with the horizon covers coins born after the cut.
- Remaining rows per place are filled with tiny probabilities for mid-tier
  coins and `p = 0` rows for coins that would need an extreme surge, which
  concentrates the unnamed share on survivors and newcomers.
- Sizes: each place's cap is projected from that rank's own trajectory across
  marks, as a fat-tailed mixture with horizon-widened spread.

Run locally:

```sh
mkdir -p out
MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
```
