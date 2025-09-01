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
    bestScore = Infinity;
  let ct = 0;
  const startTime = Date.now();
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

  // Count double headers
  const doubleHeadersByTeam = [...teamZeros];
  combo.forEach((option) => {
    option.slotByTeam.forEach((slots, t) => {
      for (let i = slots.length - 1; i--; ) {
        if (slots[i + 1] - slots[i] == 1) {
          doubleHeadersByTeam[t]++;
        }
      }
    });
  });
  score += sum(doubleHeadersByTeam) / 5; // more double-headers is worse
  score += stdev(doubleHeadersByTeam); // uneven distribution is worse
  score += doubleHeadersByTeam.filter((n) => n > 3).length * 10; // 4 double headers is unacceptable
  if (score > stopIfAbove) return score

  // Count triple headers; more is worse
  // const tripleHeadersByTeam = [...teamZeros]
  // combo.forEach(option => {
  //     option.slotByTeam.forEach((slots, t) => {
  //         for (let i=0; i<slots.length-2; i++) {
  //             if ((slots[i+1]-slots[i]) === 1 && (slots[i+2]-slots[i+1]) === 1) {
  //                 tripleHeadersByTeam[t]++
  //             }
  //         }
  //     })
  // })
  // score += sum(tripleHeadersByTeam) / 5 // more triple-headers is worse
  // score += stdev(tripleHeadersByTeam)   // uneven distribution is worse
  // if (score > stopIfAbove) return score

  // Count total number of game slots teams need to stay
  const totalSlotsByTeam = [...teamZeros];
  combo.forEach((option) => {
    option.slotByTeam.forEach((slots, t) => {
      const slotsThisRound = slots[slots.length - 1] - slots[0] + 1;
      totalSlotsByTeam[t] += slotsThisRound;
    });
  });
  score += stdev(totalSlotsByTeam) / 4; // make it fair
  if (score > stopIfAbove) return score

  // Count double byes; more is worse
  const doubleByesByTeam = [...teamZeros];
  combo.forEach((option) => {
    option.slotByTeam.forEach((slots, t) => {
      for (let i = slots.length - 1; i--; ) {
        if (slots[i + 1] - slots[i] > 2) {
          doubleByesByTeam[t]++;
        }
      }
    });
  });
  score += sum(doubleByesByTeam) / 4; // more double-byes is bad, but…
  score += stdev(doubleByesByTeam) * 2; // uneven distribution is far worse
  if (score > stopIfAbove) return score

  // Count triple byes; more is worse
  // const tripleByesByTeam = [...teamZeros];
  // combo.forEach((option) => {
  //   option.slotByTeam.forEach((slots, t) => {
  //     for (let i = slots.length - 1; i--; ) {
  //       if (slots[i + 1] - slots[i] > 3) {
  //         tripleByesByTeam[t]++;
  //       }
  //     }
  //   });
  // });
  // score += sum(tripleByesByTeam); // more triple-byes is bad, but…
  // score += stdev(tripleByesByTeam) * 4; // uneven distribution is far worse
  // if (score > stopIfAbove) return score

  // Count early and late games by team; only care about unfairness, not counts
  const slotsToIncludeInEarlyOrLate = 2;
  const earlyWeeksByTeam = [...teamZeros];
  const lateWeeksByTeam = [...teamZeros];
  combo.forEach((option) => {
    option.slotByTeam.forEach((slots, t) => {
      if (slots.some((s) => s < slotsToIncludeInEarlyOrLate))
        earlyWeeksByTeam[t]++;
      if (slots.some((s) => s >= gameSlotCount - slotsToIncludeInEarlyOrLate))
        lateWeeksByTeam[t]++;
    });
  });
  score += stdev(earlyWeeksByTeam) * 3; // More important than other fairness
  score += stdev(lateWeeksByTeam) * 3; // More important than other fairness
  if (score > stopIfAbove) return score

  const teamMatchups = [...teamZeros].map(() => [...teamZeros]);
  combo.forEach((option) => {
    option.games.forEach((gameIndex) => {
      const game = games[gameIndex];
      teamMatchups[game[0]][game[1]]++;
      teamMatchups[game[1]][game[0]]++;
    });
  });
  teamMatchups.forEach((matchups) => {
    matchups.forEach((matchCount) => {
      if (matchCount<2 || matchCount>3) score += 1;
    });
  });

  if (showStats)
    console.log(
      neatJSON(
        {
          earlyWeeksByTeam,
          lateWeeksByTeam,
          doubleHeadersByTeam,
          // tripleHeadersByTeam,
          doubleByesByTeam,
          // tripleByesByTeam,
          totalSlotsByTeam,
          teamMatchups,
        },
        { wrap: 60, aligned: true, aroundColon: 1, short: true }
      )
    );

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
