# Perfect Indoor Schedule - AI Coding Guide

## Purpose

This codebase exhaustively searches for optimal sports league schedules by pre-filtering valid game orderings per round, then evaluating all combinations using weighted scoring criteria. It's optimized for "small" leagues (6-10 teams) where brute-force exploration is feasible.

## Core Architecture

### Two-Phase Approach

1. **Generate phase** (`options/generate.js`, `generate-parallel.js`): Pre-filter valid game orderings per round based on hard constraints (no triple-headers, max idle slots, max span). For 8 teams × 3 games/night × 4 weeks, this reduces 12!⁴ (5.2e34) to 96⁴ (85M) combinations by eliminating unacceptable per-round schedules. For 6 weeks, the combinations grows to over 780 billion.
2. **Evaluate phase** (`evaluate.js`, `evaluate-parallel.js`): Explore all combinations of pre-filtered options, scoring each with weighted "pain multipliers" for soft constraints (early/late game fairness, double-headers, double-byes).

### Key Data Structures

- **`games`**: Master array of all possible team matchups: `[[0,1],[0,2],...]`
- **`optionsByRound`**: Array of rounds, each containing valid game orderings for that round
- **Option object**: `{games: [26,21,4,...], slotByTeam: [[2,4,7],[8,10,11],...], stats: {...}}`
  - `games`: Indices into master `games` array
  - `slotByTeam[teamNum]`: Which time slots that team plays (e.g., `[0,1,4]` = plays slots 0,1, then bye, bye, then slot 4)
  - `stats`: Pre-computed per-round metrics (double-headers, byes, etc.)

## Critical Workflows

### Running Evaluations

```bash
# Single-threaded (fastest for small problem spaces)
node evaluate.js

# Parallel (for larger spaces like 6+ weeks)
node evaluate-parallel.js
GRUWORKERS=8 node evaluate-parallel.js  # Control thread count

# Resume from specific combo (after Ctrl+C)
node evaluate-parallel.js --start 121604611
node evaluate-parallel.js --start 12-45-3-78  # or as indices

# Initialize with known best score
node evaluate-parallel.js --best 12-45-3-78
```

### Generating New Options

1. Edit constants at top of `options/generate.js`: `teams`, `gamesPerTeamPerRound`, `totalRounds`, `validationOptions`
2. Run `node options/generate.js` (can take hours for large configs)
3. Copy output to new file in `options/` directory
4. Update `options` variable in `evaluate-config.js` to reference new options file

### Changing Scoring Criteria

Edit `painMultipliers` object in `evaluate-config.js`:

- Set to `null` to disable a factor entirely (improves performance)
- Adjust weights to prioritize different fairness metrics
- Common pattern: `*Count` penalizes total occurrences, `*Deviation` penalizes unfairness across teams
- `unevenTeamUnhappiness`: New metric that combines all pain factors into a per-team score, then minimizes deviation across teams

## Project Conventions

### Round-Robin Scheduling

Uses circular array rotation algorithm (`roundRobinGenerator`) to create base schedule where each team plays every other team once before repeating. Mini-rounds are concatenated to fill `gamesPerTeamPerRound`.

### Scoring Philosophy

- **Lower scores are better** (accumulated "pain")
- Scores combine counts (minimize total) and standard deviations (balance across teams)
- `stopIfAbove` parameter enables early exit when score exceeds current best

### Lazy Cartesian Product

`lazyProduct()` streams combinations without materializing entire product space in memory. Critical for handling billions of combinations.

### Pre-computed Stats Pattern

Options pre-compute per-round stats (`calculateStats()`) to avoid re-computing when options are reused across combinations. Combo evaluation aggregates pre-computed stats.

### Score Breakdown Debugging

When `showStats=true` is passed to `scoreCombo()`, the output includes a score breakdown showing each metric's contribution to the total score. This helps identify which metrics are dominating the scoring and adjust weights accordingly.

## Key Files

- **`evaluate.js`**: Entry point for single-threaded evaluation runs
- **`evaluate-parallel.js`**: Entry point for parallel evaluation with worker threads, progress reporting, and resume capability
- **`evaluate-common.js`**: Shared scoring functions (`scoreCombo`, `calculateStats`), utilities (`lazyProduct`, `comboFromIndex`), and helper functions
- **`evaluate-config.js`**: Shared configuration (`options`, `painMultipliers`) - edit here to change which options file to use or adjust scoring weights
- **`evaluate-worker.js`**: Worker thread code for parallel evaluation (loaded by `evaluate-parallel.js`)
- **`options/*.js`**: Pre-filtered valid game orderings (output from generate phase)
- **`options/generate.js`**: Creates new option files; hard-codes some validation logic (lines 100-150)
- **`topscore-schedule-csv.js`**: Converts final schedule array to CSV for TopScore import
- **`best-results/*.txt`**: Archives of optimal schedules found with their stats

## Dependencies

Only `neatjson` for pretty-printing results. No testing framework; validation is through exhaustive search and manual inspection of results.

## Common Patterns

- **Team indices are 0-based**: Team 0 through Team N-1
- **Game slots are sequential**: 0 = first game, 11 = last game (for 12 games/round)
- **Double-header**: Two consecutive game slots for same team
- **Double-bye**: Team sits idle for 2+ games between plays
- **Early/late slots**: Configurable in `scoreCombo()`, typically first/last 2 slots per round
