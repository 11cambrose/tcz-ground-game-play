/* List scene files to load (one per slot is typical). Each file calls TCZ.cinema.register('<slot>', function (payload, api) {...}).
   Slots: levelEnter, seatDiscover, challengeStart, swing, mate, shrineClear, gateOpen, closer, levelTravel.
   Empty = every slot shows its stub card. Example: var TCZ_SCENES = ['example-gate-open.js']; */
var TCZ_SCENES = [];
