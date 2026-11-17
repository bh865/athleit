# Sport configs

`public.sport_configs` holds one row per launch sport. It drives the shape of the game-result
form and the database's result validation (`private.validate_game_result`). A game can override
the period count and length with `events.game_format` (`{"period_count": 4, "period_minutes": 10}`).
The mirror in `packages/core/src/scheduling.ts` (`SPORT_CONFIG_DEFAULTS`) must match this table.

| Sport      | Period type | Periods | Minutes each | Ties allowed | Scoring label | Positions                         |
| ---------- | ----------- | :-----: | :----------: | :----------: | ------------- | --------------------------------- |
| soccer     | half        |    2    |      30      |     yes      | Goals         | GK, DEF, MID, FWD                 |
| basketball | quarter     |    4    |      8       |      no      | Points        | PG, SG, SF, PF, C                 |
| volleyball | set         |    3    |     none     |      no      | Sets won      | OH, MB, OPP, S, L, DS             |
| football   | quarter     |    4    |      12      |     yes      | Points        | QB, RB, WR, TE, OL, DL, LB, DB, K |
| baseball   | inning      |    6    |     none     |     yes      | Runs          | P, C, 1B, 2B, 3B, SS, LF, CF, RF  |
| softball   | inning      |    7    |     none     |     yes      | Runs          | P, C, 1B, 2B, 3B, SS, LF, CF, RF  |
| hockey     | period      |    3    |      15      |     yes      | Goals         | G, D, C, LW, RW                   |

## Please review: these vary by league

- **Soccer half length (30 min).** US Youth Soccer: U8 about 25, U10 about 30, U12 about 35, U14 about 40. Override per game, or change the default.
- **Basketball quarter length (8 min) and quarters.** Many rec leagues play 8-minute quarters; others play two 20-minute halves (set `period_count` 2 per game). Ties are **disallowed** because overtime decides the game; some rec leagues allow a tie at time.
- **Volleyball set count (3).** Best of 3 is typical for youth; older divisions play best of 5 (`period_count` 5). Volleyball results store **sets won** as the score (2-1) and each set's points in `period_scores`. Ties disallowed.
- **Football quarter length (12 min) and ties (allowed).** Tackle youth leagues vary from 8 to 12 minutes and many use overtime in playoffs only.
- **Baseball innings (6) and ties (allowed).** Youth baseball is 6 innings; 7 for older divisions. Time limits can end a game tied, so ties are allowed.
- **Softball innings (7) and ties (allowed).** Same reasoning; some leagues play 6.
- **Hockey period length (15 min) and ties (allowed).** Youth periods run 12 to 15 minutes; overtime rules vary.
- **Positions** are suggestions for a future lineup feature; nothing enforces them. `team_players.position` stays free text.

Extra periods: for timed sports and innings, a result may include up to **10 periods beyond the
format** (overtime, extra innings). Sets are best-of-N and get none.

To change a default, add a migration that updates the row; never edit a pushed migration.
