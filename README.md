While [Rephinez](https://github.com/Phrogz/rephinez) provides a mechanism for
roughly finding good league schedules for large leagues, we happened
to be running a league with "small" combinations. We wanted to see if we could
fully explore every possible schedule to find the best one. We have:

* The league plays once per week, over 4 weeks of play
* There are 8 teams playing 12 games each week (each team playing 3 times)

With 48 games to be played, a naive exploration of the space requires evaluating
`48!` = 1.24e61 game combinations. This is infeasible.

# Shrinking the Problem Space

A standard round-robin algorithm provides a good starting schedule matching the
above criteria, ensuring each team plays one another before the schedule
repeats. As such, we can assume that we only have to shuffle games around WITHIN
each week of play. This reduces the number of combinations to `12!⁴` = 5.2e34.
That is a large improvement, but not good enough.

Within those combinations are a large number of unacceptable options each week:

* No team should be required to play a triple header.
* No team should be required to play, and then sit idle for three or more games,
  waiting for their turn to play again.

If we can look through the `12!` = 479,001,600 combinations each week and throw
away unacceptable options, we can further reduce the problem space to explore.

It turns out that there are only 384 options each week that are acceptable. This
reduces the total problem space to `384⁴` = 21,743,271,936 combinations. That is
almost acceptable; it could be fully explored by a computer in under a day.

However, we can pare it down a little farther. Although we cannot require that
no team ever has to sit idle for two games—there are no schedules in the 479
million combinations per week that allow that—we can require that no team has to
sit idle for two games TWICE in the same night. Adding this constraint reduces
the number acceptable options for each week to just 96, and thus brings the
overall problem space to search to just `96⁴` = 84,934,656.

These 96 options per week can be found in [`options.js`](./options.js)

85 million schedules can be explored in a matter of minutes, allowing us to try
out different ways of scoring the schedules to find the best.

# What's a Good Schedule?

So, what are we looking for?

## Fairness in Early/Late Games

In our league, some players get surly if they always have the early games,
because they have difficulty leaving work and fighting traffic to arrive in
time. Other players get surly if they always have to play until the latest time
slots. Minimizing this and making it fair is the first goal.

If we assume the first two time slots are "early", and the last two time slots
are "late", then we know that there are a required minimum of 16 early games
and 16 late games.
(2 time slots * 2 teams per time slot * 4 weeks of play = 16 games of each type)

Exploring the schedule JUST to minimize the standard deviation of number of
games of each type played by each team, we discover that there are no schedules
within the 85 million where each team has exactly 2 early games and 2 late games.

There are hundreds of schedules with an even number of early games, but uneven late:

```js
"earlyByTeam" : [2,2,2,2,2,2,2,2]
"lateByTeam"  : [0,2,3,2,3,2,2,2]
```

and hundreds more with uneven early and even late:

```js
"earlyByTeam" : [0,3,3,2,2,2,2,2]
"lateByTeam"  : [2,2,2,2,2,2,2,2]
```

but it is not possible—given our initial constraints that pared us down to just
96 options per week—to make a perfectly-fair schedule.

The same holds true if we consider "early" and "late" to be the first 3 or 4
game slots. For example, for 4 game slots, the best schedule we can get has:

```js
"earlyByTeam" : [4,4,4,4,4,4,4,4]
"lateByTeam"  : [2,4,4,4,5,4,5,4]
```

## Fairness in Double-Headers

Score statistics imply that teams with a double-header tend to win their
second game the majority of the time. Despite this, few are excited to play a
double-header; it's exhausting. We'd like to minimize double-headers, and also
ensure that they are distributed evenly amongst teams.

No schedule in the 85 million exists with fewer than 12 double headers played.
Ideally, then, we'd like to pick one of the (many) schedules like:

```js
"doubleHeadersByTeam" : [1,1,1,1,2,2,2,2]
```


## Fairness in Double Byes

We've already ruled out triple byes, and ensured that no team has to sit idle
for two games TWICE in the same night...but it would still be unfair if one
team had a double-bye every week, while another team never had a double-bye.
Further, we don't want to include double-byes if we don't have to. We want
teams to be able to get in and get out.

Searching the 85 million schedules for ones with the smallest number of
double-byes overall we find that 16 total double-byes are required overall.
No schedule exists with 15 or fewer double-byes.
(I don't know why this is, it just is.)

So, ideally, we want a schedule like this:

```js
"doubleByesByTeam" : [2,2,2,2,2,2,2,2]
```

However, no such schedule exists amongst in the 85 million. The closest we can
find are those where three teams have a third double-bye, e.g.

```js
"doubleByesByTeam" : [3,2,2,3,2,2,3,2]
```


## Bringing it All Together

Proving that individual schedules exist with different characteristics does not
prove (or find) schedules that combine them all. If you run `npm install` and
then run [`node evaluate.js`](./evaluate.js), you will get output that ends with:

```txt
Combo #78,844,247 (89-11-14-22) has a score of 9.200
{
  "earlyByTeam"         : [0,2,2,2,3,2,3,2],
  "lateByTeam"          : [2,2,2,2,2,2,2,2],
  "doubleHeadersByTeam" : [1,2,2,2,1,1,1,2],
  "doubleByesByTeam"    : [4,1,1,2,3,2,3,2]
}

Evaluated 84,934,656 combinations in 292s (291,183 per second)
The best schedule is:
[
  [[1,4],[4,6],[1,2],[3,4],[1,6],[2,3],[0,6],[2,5],[3,7],[0,5],[5,7],[0,7]],
  [[3,5],[1,3],[1,5],[0,3],[1,7],[5,6],[0,4],[6,7],[0,2],[4,7],[2,6],[2,4]],
  [[5,7],[2,7],[2,5],[0,7],[2,3],[4,5],[0,6],[3,4],[0,1],[3,6],[1,4],[1,6]],
  [[2,6],[4,6],[1,2],[6,7],[2,4],[1,7],[0,4],[1,5],[3,7],[0,5],[0,3],[3,5]]
]
```

We've succeeded in optimizing early/late games and double headers as best as
they can be done. However, in doing so one team gets a double-bye every week.
Something about the other fairness optimizations forces us to this conclusion.

Alternatively, if we comment out line 45, so that we don't try to minimize
double-headers, just make them _fair_ (so every team has 2), and increase
the weighting on it, we can get a schedule without that problem, but with less
fairness in the early/late games:

```txt
Combo #4,161,215 (4-67-49-94) has a score of 7.328
{
  "earlyByTeam"         : [2,2,3,1,2,1,3,2],
  "lateByTeam"          : [2,3,2,2,1,3,2,1],
  "doubleHeadersByTeam" : [2,2,2,2,2,2,2,2],
  "doubleByesByTeam"    : [3,2,2,3,3,2,2,3]
}

Evaluated 84,934,656 combinations in 277s (306,402 per second)
The best schedule is:
[
  [[5,7],[3,7],[2,5],[0,7],[2,3],[0,5],[3,4],[1,2],[0,6],[1,4],[4,6],[1,6]],
  [[2,4],[0,4],[0,2],[4,7],[2,6],[0,3],[6,7],[1,7],[3,5],[5,6],[1,3],[1,5]],
  [[0,6],[1,6],[0,1],[3,6],[1,4],[0,7],[3,4],[2,3],[5,7],[4,5],[2,7],[2,5]],
  [[2,6],[1,2],[6,7],[2,4],[1,7],[4,6],[1,5],[3,7],[0,4],[3,5],[0,3],[0,5]]
]
```

# Trying it Yourself

Want different criteria? Different weighting? Edit the contents of `scoreCombo()` in `evaluate.js` and see what good schedule you can find. :)
