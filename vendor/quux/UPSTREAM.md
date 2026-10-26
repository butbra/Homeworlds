Quuxplusone/Homeworlds
https://github.com/Quuxplusone/Homeworlds
Commit: 20d2ec4a70365acc4b8ba8cd6bae7125fa935513

The included core C++ source and headers are unchanged. bridge.cc exposes the original get_ai_move and copies the native CLI setup_ai procedure for browser use. The coaching export calls the unchanged evaluator and winning-reply search. Level 10 calls the original selector. Levels 1–9 deliberately sample lower-ranked native legal candidates without the full selector’s tactical safety filter. These weaker levels are browser practice settings, not upstream strength ratings. Display the opponent as Quux Bot. See LICENSE for attribution and terms.
