# make.fun polymarket-faa-attribution-01 entry

A program that forecasts Polymarket's FAA outage attribution prices minute by
minute, 4 hours ahead, for the make.fun bounty
[polymarket-faa-attribution-01](https://make.fun/bounty/polymarket-faa-attribution-01)
($250 in USDC).

## How it works

For each market of a case, the program reads the Yes prices up to the case's
checkpoint and writes a 240-minute forecast of five quantiles (0.05, 0.25,
0.5, 0.75, 0.95) per minute to `/output/<case>.out`.

The forecast is a persistence forecast with a price-level-aware spread:

```
q_tau(h) = clamp(x + z_tau * sigma(x) * sqrt(h), 0, 1)
sigma(x) = 0.008 * sqrt(x * (1 - x))
```

where `x` is the market's price at the checkpoint and `z_tau` is the standard
normal quantile at each level. A Yes price is a probability, so its
minute-to-minute moves scale with the binomial spread `sqrt(x * (1 - x))`:
a market at 0.5 moves much more than one at 0.02. The median stays at the
checkpoint price (no drift).

On the kit's six practice cases, scored against Polymarket's recorded prices,
this scores a mean pinball loss of **0.297691**, vs **0.363589** for the house
baseline's fixed sigma of 0.0025. The practice is a different event (Next CEO
of NVIDIA), so its score is no guide to the final; the shape of the spread,
not the exact constant, is what should carry over.

## Run

```sh
mkdir -p out && MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
```

Node 22, standard library only, no network.

Owner: Dafi27 · Repo: makefun-faa-attribution-01 · Referral code: tm9bafze
