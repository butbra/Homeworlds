# Rules13 implementation audit

Scope: standard two-player local Homeworlds, using the supplied 2020 Looney Labs Rules13 booklet. Optional handicaps and multiplayer variants on pp. 14–19 are outside this two-player implementation. This checklist records implemented rules and regression coverage; it does not claim that finite tests prove every possible game position.

| Booklet | Rule | Implementation and coverage |
| --- | --- | --- |
| pp. 2–5 | Shared 36-piece bank; starting round chooses two stars of any size/color and one large ship each, in player order | Fresh page is empty. Setup validates available pieces, first player's choices precede the second, identical/Gemini stars allowed. Each player explicitly confirms with End turn after reviewing three pieces. Partial setup and confirmation stage persist; undo cannot change the other player’s confirmed setup. `setup.test.ts`, browser setup checks. |
| p. 4 | Agree who starts, flip a coin for equal skill or let the less experienced player start | Seat the agreed starting player as Player 1; setup instructions explain this. |
| pp. 3, 6 | Connection depends only on no overlapping star sizes | Single, binary, and Gemini cases tested. Colors and ship sizes do not determine connectivity. |
| pp. 5–7 | One basic action using local star/own-ship power; opponent power unavailable | Pure reducer validates local presence and power, consumes the one basic action. |
| p. 7 | Build matches an owned local ship color, uses smallest available bank size | Reducer and clicked physical bank size both checked; green sacrifice does not waive local color-presence restriction. |
| pp. 7–8 | Move/discover only connected stars; new star comes from bank; abandoned ordinary system returned immediately | Reducer validates before removing source pieces. Homeworlds remain when temporarily empty. Tests cover discovery, cleanup, and restoration before turn end. |
| p. 8 | Capture enemy ship no larger than largest local owned ship, with access to red | Capture transfers ownership. A small red can empower a larger friendly ship; basic move cannot also capture. |
| p. 9 | Trade exact size, different color, available in bank | Bank selection and reducer both check exact size; previous ship returns to bank. |
| pp. 5, 9 | Catastrophe is optional, free, and permitted anywhere in active player's turn; four or more of one color across stars and both fleets | Sidebar lists ALL eligible systems, including remote enemy-only systems, before/after basic actions and during selection/sacrifice. No automatic catastrophe. Tests cover remote activation, local activation, both fleets, stars, and action-count conservation. |
| p. 9 | Catastrophe removes that color; loss of last star destroys every ship; surviving half of binary preserves other colors | Tests cover half-star, same-color binary destruction, ordinary-system cleanup, and changed connections. Visual explosion decorates the committed result; animation never changes rules timing. |
| p. 5 | Sacrifice instead of basic action; pip count in actions of sacrificed color globally where ships remain | Tests exercise all four sacrifice powers, color lock, one sacrifice only, immediate bank return, and forfeiture of unused actions. |
| pp. 10–11 | At turn confirmation, no surviving star or no owned homeworld ship means loss; simultaneous loss means draw | End-turn checks both players and announces the winner/draw plus reason in a dialog and the sidebar. Temporary homeworld abandonment during sacrifice actions is permitted. Resignation and mutually confirmed agreed draws supported. |
| p. 12 | Star towing changes layout without spending an action | Drag grips or arrow keys; saved layout is separate from game state. |
| pp. 24–27 | Investing, Factory, Teleporting, Terraforming, Hyperspace Bypass | Dedicated regression scenarios verify piece return timing, rebuilding sacrificial pieces, global build access, and changed connectivity after a star half is destroyed. |

Animations for build, trade, capture, movement, discovery, sacrifice, and catastrophe are brief, nonblocking, and disabled for `prefers-reduced-motion`. Invalid actions never mutate the board or play action effects.
