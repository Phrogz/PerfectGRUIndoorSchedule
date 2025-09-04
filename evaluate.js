// Evaluate all combinations of a particular set of options and find the best ones

// const options = "6teams_3gamespernight_4weeks"
// const options = "6teams_3gamespernight_4weeks_6max"
// const options = "6teams_3gamespernight_4weeks-HACKED"
// const options = "6teams_4gamespernight_4weeks"
// const options = "8teams_3gamespernight_4weeks_6max"
// const options = "6teams_3gamespernight_5weeks_5max"
// const options = "6teams_3gamespernight_5weeks_6max"
const options = "8teams_3gamespernight_5weeks_6max"
// const options = "6teams_4gamespernight_4weeks-8slotsmax-notriple"
// const options = "8teams_3gamespernight_4weeks"
// const options = "10teams_1gamepernight_8weeks"
// const options = "10teams_2gamespernight_6weeks"

// Use null to omit a factor (and speed up the evaluation)
const painMultipliers = {
  doubleHeaderCount:      0.1,  // don't mind double headers
  doubleHeaderDeviation:  0.5,  // but balance them across teams
  tripleHeaderCount:      null, // these are prevented in the options
  tripleHeaderDeviation:  null,
  doubleByeCount:         0.4,  // need to see the stats
  doubleByeDeviation:     3.0,  // but balance them across teams
  tripleByeCount:         null, // these are prevented in the options
  tripleByeDeviation:     null,
  earlyLateDeviation:     2.0,
  totalSlotCount:         2.0,
  totalSlotsDeviation:    0.2,
}

const { games, optionsByRound } = require(`./options/${options}`);
const { neatJSON } = require("neatjson");

const teamCount =
  Math.max.apply(
    Math,
    games.flatMap((x) => x)
  ) + 1;
const teamZeros = new Array(teamCount).fill(0);
const gameSlotCount = optionsByRound[0][0].games.length;

function findBestCombo() {
  let bestCombo,
      bestScore = Infinity,
      ct = 0
  const startTime = Date.now()
  lazyProduct(optionsByRound, (...combo) => {
    const comboScore = scoreCombo(combo, false, bestScore)
    ++ct
    if (comboScore <= bestScore) {
      bestScore = comboScore
      bestCombo = combo
      console.log(
        `Combo #${ct.toLocaleString("en-US")} (${indicesFromCombo(combo).join(
          "-"
        )}) has a score of ${bestScore.toFixed(3)}`
      )
      console.log(neatJSON(gamesForCombo(combo), { wrap: 120, short: true }))
      scoreCombo(combo, true)
      console.log()
    }
  });
  const elapsed = (Date.now() - startTime) / 1000;
  console.log(
    `Evaluated ${ct.toLocaleString("en-US")} combinations in ${elapsed.toFixed(
      0
    )}s (${Math.round(ct / elapsed).toLocaleString("en-US")} per second)`
  )
  console.log("The best schedule is:")
  console.log(neatJSON(gamesForCombo(bestCombo), { wrap: 120, short: true }))
}

function scoreCombo(combo, showStats, stopIfAbove=Infinity) {
  // higher scores are worse
  let score = 0;

  let doubleHeadersByTeam, tripleHeadersByTeam, totalSlotsByTeam, earlyWeeksByTeam, lateWeeksByTeam, doubleByesByTeam, tripleByesByTeam

  // Count double headers
  if (painMultipliers.doubleHeaderCount || painMultipliers.doubleHeaderDeviation) {
    doubleHeadersByTeam = [...teamZeros]
    combo.forEach((option) => {
      option.slotByTeam.forEach((slots, t) => {
        for (let i = slots.length - 1; i--; ) {
          if (slots[i + 1] - slots[i] == 1) {
            doubleHeadersByTeam[t]++
          }
        }
      });
    });
    if (painMultipliers.doubleHeaderCount)     score += sum(doubleHeadersByTeam) * painMultipliers.doubleHeaderCount
    if (painMultipliers.doubleHeaderDeviation) score += stdev(doubleHeadersByTeam) * painMultipliers.doubleHeaderDeviation
    if (score > stopIfAbove) return score
  }

  // Count triple headers; more is worse
  if (painMultipliers.tripleHeaderCount || painMultipliers.tripleHeaderDeviation) {
    tripleHeadersByTeam = [...teamZeros]
    combo.forEach(option => {
        option.slotByTeam.forEach((slots, t) => {
            for (let i=0; i<slots.length-2; i++) {
                if ((slots[i+1]-slots[i]) === 1 && (slots[i+2]-slots[i+1]) === 1) {
                    tripleHeadersByTeam[t]++
                }
            }
        })
    })
    if (painMultipliers.tripleHeaderCount)     score += sum(tripleHeadersByTeam) * painMultipliers.tripleHeaderCount
    if (painMultipliers.tripleHeaderDeviation) score += stdev(tripleHeadersByTeam) * painMultipliers.tripleHeaderDeviation
    if (score > stopIfAbove) return score
  }

  // Count total number of game slots teams need to stay
  if (painMultipliers.totalSlotCount || painMultipliers.totalSlotsDeviation) {
    totalSlotsByTeam = [...teamZeros];
    combo.forEach((option) => {
      option.slotByTeam.forEach((slots, t) => {
        const slotsThisRound = slots[slots.length - 1] - slots[0] + 1;
        totalSlotsByTeam[t] += slotsThisRound;
      });
    });
    if (painMultipliers.totalSlotCount)      score += sum(totalSlotsByTeam) * painMultipliers.totalSlotCount
    if (painMultipliers.totalSlotsDeviation) score += stdev(totalSlotsByTeam) * painMultipliers.totalSlotsDeviation
    if (score > stopIfAbove) return score
  }

  // Count double byes; more is worse
  if (painMultipliers.doubleByeCount || painMultipliers.doubleByeDeviation) {
    doubleByesByTeam = [...teamZeros];
    combo.forEach((option) => {
      option.slotByTeam.forEach((slots, t) => {
        for (let i = slots.length - 1; i--; ) {
          if (slots[i + 1] - slots[i] > 2) {
            doubleByesByTeam[t]++;
          }
        }
      });
    });
    if (painMultipliers.doubleByeCount)     score += sum(doubleByesByTeam) * painMultipliers.doubleByeCount
    if (painMultipliers.doubleByeDeviation) score += stdev(doubleByesByTeam) * painMultipliers.doubleByeDeviation
    if (score > stopIfAbove) return score
  }


  // Count triple byes; more is worse
  if (painMultipliers.tripleByeCount || painMultipliers.tripleByeDeviation) {
    tripleByesByTeam = [...teamZeros];
    combo.forEach((option) => {
      option.slotByTeam.forEach((slots, t) => {
        for (let i = slots.length - 1; i--; ) {
          if (slots[i + 1] - slots[i] > 3) {
            tripleByesByTeam[t]++;
          }
        }
      });
    });
    if (painMultipliers.tripleByeCount)     score += sum(tripleByesByTeam) * painMultipliers.tripleByeCount
    if (painMultipliers.tripleByeDeviation) score += stdev(tripleByesByTeam) * painMultipliers.tripleByeDeviation
    if (score > stopIfAbove) return score
  }

  // Count early and late games by team; only care about unfairness, not counts
  if (painMultipliers.earlyLateDeviation) {
    const slotsToIncludeInEarlyOrLate = 2
    earlyWeeksByTeam = [...teamZeros]
    lateWeeksByTeam = [...teamZeros]
    combo.forEach((option) => {
      option.slotByTeam.forEach((slots, t) => {
        if (slots.some((s) => s < slotsToIncludeInEarlyOrLate)) earlyWeeksByTeam[t]++
        if (slots.some((s) => s >= gameSlotCount - slotsToIncludeInEarlyOrLate)) lateWeeksByTeam[t]++
      })
    })
    score += stdev(earlyWeeksByTeam) * painMultipliers.earlyLateDeviation / 2
    score += stdev(lateWeeksByTeam)  * painMultipliers.earlyLateDeviation / 2
    if (score > stopIfAbove) return score
  }

  // Count how many times each team plays each other team
  const teamMatchups = [...teamZeros].map(() => [...teamZeros])
  combo.forEach((option) => {
    option.games.forEach((gameIndex) => {
      const game = games[gameIndex]
      teamMatchups[game[0]][game[1]]++
      teamMatchups[game[1]][game[0]]++
    })
  })
  teamMatchups.forEach((matchups) => {
    matchups.forEach((matchCount) => {
      if (matchCount<2 || matchCount>3) score += 1
    })
  })

  if (showStats) {
    stats = {}
    if (earlyWeeksByTeam) stats.earlyWeeksByTeam = earlyWeeksByTeam
    if (lateWeeksByTeam)  stats.lateWeeksByTeam  = lateWeeksByTeam
    if (doubleHeadersByTeam) stats.doubleHeadersByTeam = doubleHeadersByTeam
    if (tripleHeadersByTeam) stats.tripleHeadersByTeam = tripleHeadersByTeam
    if (doubleByesByTeam) stats.doubleByesByTeam = doubleByesByTeam
    if (tripleByesByTeam) stats.tripleByesByTeam = tripleByesByTeam
    if (totalSlotsByTeam) stats.totalSlotsByTeam = totalSlotsByTeam
    stats.teamMatchups = teamMatchups
    console.log(neatJSON(stats, { wrap: 60, aligned: true, aroundColon: 1, short: true }))
  }

  return score
}

function comboFromIndices(optionIndices) {
  return optionIndices.map(
    (optionIndex, roundIndex) => optionsByRound[roundIndex][optionIndex]
  );
}

function indicesFromCombo(combo) {
  return combo.map((option, roundIndex) =>
    optionsByRound[roundIndex].indexOf(option)
  );
}

function gamesForCombo(combo) {
  return combo.map((option) =>
    option.games.map((gameIndex) => games[gameIndex])
  );
}

function sum(array) {
  let sum = 0;
  for (let i = array.length; i--; ) sum += array[i];
  return sum;
}

function average(array) {
  let sum = 0;
  for (let i = array.length; i--; ) sum += array[i];
  return sum / array.length;
}

function stdev(a) {
  const avg = average(a);
  return Math.sqrt(average(a.map((n) => (n - avg) ** 2)));
}

// http://phrogz.net/lazy-cartesian-product
function lazyProduct(sets, ƒ, context) {
  context ||= this;
  const p = [],
    max = sets.length - 1,
    lens = [];
  for (let i = sets.length; i--; ) lens[i] = sets[i].length;
  function dive(d) {
    const a = sets[d],
      len = lens[d];
    if (d == max)
      for (let i = 0; i < len; ++i) (p[d] = a[i]), ƒ.apply(context, p);
    else for (let i = 0; i < len; ++i) (p[d] = a[i]), dive(d + 1);
    p.pop();
  }
  dive(0);
}

findBestCombo();
