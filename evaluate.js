const options = "6teams_3gamespernight_4weeks"
// const options = "8teams_3gamespernight_4weeks"
// const options = "10teams_1gamepernight_8weeks"
// const options = "10teams_2gamespernight_6weeks"

const {games, optionsByRound} = require(`./options/${options}`)
const { neatJSON } = require('neatjson')

const teamCount = Math.max.apply(Math, games.flatMap(x => x)) + 1
const teamZeros = new Array(teamCount).fill(0)
const gameSlotCount = optionsByRound[0][0].games.length

function findBestCombo() {
    let bestCombo, bestScore = Infinity
    let ct = 0
    const startTime = Date.now()
    lazyProduct(optionsByRound, (...combo) => {
        const comboScore = scoreCombo(combo)
        ++ct
        if (comboScore <= bestScore) {
            bestScore = comboScore
            bestCombo = combo
            console.log(`Combo #${ct.toLocaleString("en-US")} (${indicesFromCombo(combo).join('-')}) has a score of ${bestScore.toFixed(3)}`)
            console.log(neatJSON(gamesForCombo(combo), {wrap:120, short:true}))
            scoreCombo(combo, true)
            console.log()
        }
    })
    const elapsed = (Date.now() - startTime) / 1000
    console.log(`Evaluated ${ct.toLocaleString("en-US")} combinations in ${elapsed.toFixed(0)}s (${Math.round(ct / elapsed).toLocaleString("en-US")} per second)`)
    console.log("The best schedule is:")
    console.log(neatJSON(gamesForCombo(bestCombo), {wrap:120, short:true}))
}

function scoreCombo(combo, showStats) {
    // higher scores are worse
    let score = 0

    // Count double headers; more is worse
    const doubleHeadersByTeam = [...teamZeros]
    combo.forEach(option => {
        option.slotByTeam.forEach((slots, t) => {
            for (let i=slots.length-1; i--;) {
                if ((slots[i+1] - slots[i]) == 1) {
                    doubleHeadersByTeam[t]++
                }
            }
        })
    })
    score += sum(doubleHeadersByTeam) / 5
    score += stdev(doubleHeadersByTeam)


    // Count double byes; more is worse
    const doubleByesByTeam = [...teamZeros]
    combo.forEach(option => {
        option.slotByTeam.forEach((slots, t) => {
            for (let i=slots.length-1; i--;) {
                if ((slots[i+1] - slots[i]) > 2) {
                    doubleByesByTeam[t]++
                }
            }
        })
    })
    score += sum(doubleByesByTeam) / 5
    score += stdev(doubleByesByTeam)


    // Count early and late games by team; only care about unfairness, not counts
    const slotsToIncludeInEarlyOrLate = 2
    const earlyByTeam = [...teamZeros]
    const lateByTeam  = [...teamZeros]
    combo.forEach(option => {
        option.slotByTeam.forEach((slots, t) => {
            for (let i=slots.length; i--;) {
                if (slots[i] < slotsToIncludeInEarlyOrLate) earlyByTeam[t]++
                else if (slots[i] >= gameSlotCount-slotsToIncludeInEarlyOrLate) lateByTeam[t]++
            }
        })
    })
    score += stdev(earlyByTeam) * 2 // More important than other fairness
    score += stdev(lateByTeam) * 2  // More important than other fairness


    if (showStats) console.log(neatJSON(
        {earlyByTeam, lateByTeam, doubleHeadersByTeam, doubleByesByTeam},
        {wrap:60, aligned:true, aroundColon:1, short:true}
    ))

    return score
}

function comboFromIndices(optionIndices) {
    return optionIndices.map((optionIndex, roundIndex) => optionsByRound[roundIndex][optionIndex])
}

function indicesFromCombo(combo) {
    return combo.map((option,roundIndex) => optionsByRound[roundIndex].indexOf(option))
}

function gamesForCombo(combo) {
    return combo.map(option => option.games.map(gameIndex => games[gameIndex]))
}

function sum(array) {
    let sum = 0
    for (let i=array.length; i--;) sum += array[i]
    return sum
}

function average(array) {
    let sum = 0
    for (let i=array.length; i--;) sum += array[i]
    return sum / array.length
}

function stdev(a) {
    const avg = average(a)
    return Math.sqrt(average(a.map(n => (n-avg)**2)))
}

// http://phrogz.net/lazy-cartesian-product
function lazyProduct(sets, ƒ, context){
    context ||= this
    const p=[], max=sets.length-1, lens=[]
    for (let i=sets.length; i--;) lens[i]=sets[i].length
    function dive(d){
        const a=sets[d], len=lens[d]
        if (d==max) for (let i=0; i<len; ++i) p[d]=a[i], ƒ.apply(context, p)
        else        for (let i=0; i<len; ++i) p[d]=a[i], dive(d+1)
        p.pop()
    }
    dive(0)
}

findBestCombo()
