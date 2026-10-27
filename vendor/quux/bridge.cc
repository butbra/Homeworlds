#include "state.h"
#include "AI.h"
#include "AllMoves.h"
#include "ApplyMove.h"
#include "PlanetNames.h"
#include "ToComparableString.h"
#include <algorithm>
#include <cstdlib>
#include <string>
#include <cstdio>
#include <set>

static std::string result;

// Coaching exposes the existing evaluator and winning-reply test without
// modifying get_ai_move, move generation, or any upstream decision code.
static std::string json_string(const std::string &s) {
    std::string out = "\"";
    for (char c : s) {
        if (c == '\\' || c == '"') out += '\\';
        if (c == '\n') out += "\\n";
        else out += c;
    }
    return out + "\"";
}

static std::string inspect_position(const GameState &st, int player) {
    const bool own_lost = st.hasLost(player), enemy_lost = st.hasLost(1-player);
    const int outcome = own_lost && enemy_lost ? 2 : own_lost ? 1-player : enemy_lost ? player : -1;
    WholeMove reply;
    const bool threatened = outcome == -1 && findWinningMove(st, 1-player, &reply);
    const int score = outcome == 2 ? 0 : ai_static_evaluation(st, player);
    return "{\"score\":" + std::to_string(score) +
        ",\"outcome\":" + std::to_string(outcome) +
        ",\"losesNext\":" + (threatened ? "true" : "false") +
        ",\"winningReply\":" + json_string(threatened ? reply.toString() : "") + "}";
}

extern "C" const char *coach_position(const char *text, int player) {
    const std::string input(text), separator = "\n===COACH===\n";
    const auto split = input.find(separator);
    GameState original;
    const std::string opening = input.substr(0, split);
    if ((player != 0 && player != 1) || !original.scan(opening.c_str()) || original.gameIsOver()) {
        result = "ERROR: Invalid coaching position";
        return result.c_str();
    }
    const WholeMove best = get_ai_move(original, player);
    GameState after = original;
    if (ApplyMove::Whole(after, player, best) != ApplyMove::SUCCESS) {
        result = "ERROR: Quux recommendation failed validation";
        return result.c_str();
    }
    const std::string best_review = inspect_position(after, player);
    std::string candidate = "null";
    if (split != std::string::npos) {
        GameState staged;
        if (!staged.scan(input.substr(split + separator.size()).c_str())) {
            result = "ERROR: Invalid staged position";
            return result.c_str();
        }
        candidate = inspect_position(staged, player);
    }
    result = "{\"bestMove\":" + json_string(best.toString()) +
        ",\"best\":" + best_review + ",\"candidate\":" + candidate + "}";
    return result.c_str();
}

// Match a complete turn to an already staged position AND its remaining action
// allowance. This never treats a half-played sacrifice as a fresh basic turn.
static bool passes_staged(const GameState &original, int player, const WholeMove &move,
                         const GameState &staged, int wanted_sac, int wanted_color, int wanted_left) {
    GameState prefix = original;
    int sac = 0, color = -1, left = 1;
    const std::string target = staged.toComparableString();
    auto matches = [&]() { return sac == wanted_sac && color == wanted_color && left == wanted_left && prefix.toComparableString() == target; };
    if (matches()) return true;
    for (const auto &action : move.actions) {
        if (action.kind == SACRIFICE) { sac = 1; color = int(action.piece.color); left = 1+int(action.piece.size); }
        else if (action.kind != CATASTROPHE) --left;
        const auto rc = ApplyMove::Single(prefix, player, action);
        if (rc != ApplyMove::SUCCESS && rc != ApplyMove::SUICIDE) return false;
        if (matches()) return true;
    }
    return false;
}

extern "C" const char *guide_position(const char *text, int player) {
    const std::string input(text), separator = "\n===GUIDE===\n";
    const auto split = input.find(separator);
    if (split == std::string::npos || (player != 0 && player != 1)) { result = "ERROR: Invalid guide request"; return result.c_str(); }
    const auto header_start = split + separator.size(), board_start = input.find('\n', header_start);
    int sac, color, left;
    GameState original, staged;
    if (board_start == std::string::npos || std::sscanf(input.substr(header_start,board_start-header_start).c_str(),"%d %d %d",&sac,&color,&left) != 3 ||
        (sac != 0 && sac != 1) || left < 0 || left > 3 || (!sac && (color != -1 || left > 1)) || (sac && (color < 0 || color > 3)) ||
        !original.scan(input.substr(0,split).c_str()) || original.gameIsOver() || !staged.scan(input.substr(board_start+1).c_str())) {
        result = "ERROR: Invalid guide position"; return result.c_str();
    }
    const std::string current = inspect_position(staged,player);
    const WholeMove native_best = get_ai_move(original,player);
    GameState baseline_state = original;
    const bool baseline_valid = ApplyMove::Whole(baseline_state,player,native_best) == ApplyMove::SUCCESS;
    const std::string baseline = baseline_valid ? inspect_position(baseline_state,player) : "null";
    auto moves = get_all_moves_sorted_by_value(original,player,false);
    moves.insert(moves.begin(),native_best);
    std::set<std::string> seen;
    std::string choices;
    int accepted = 0, checked = 0, best_score = 0;
    bool winning = false, limited = false;
    for (auto move : moves) {
        if (!passes_staged(original,player,move,staged,sac,color,left)) continue;
        // A pass with no staged action cannot be confirmed by this tabletop.
        if (move.isPass() && !sac && left == 1) continue;
        GameState after = original;
        if (ApplyMove::Whole(after,player,move) != ApplyMove::SUCCESS || after.hasLost(player)) continue;
        const auto fingerprint = after.toComparableString();
        if (!seen.insert(fingerprint).second) continue;
        const int score = ai_static_evaluation(after,player);
        const bool win = after.hasLost(1-player);
        if (accepted && ((winning && !win) || score < best_score-24)) continue;
        if (checked >= 16) { limited = true; break; }
        ++checked;
        if (!win && findWinningMove(after,1-player,nullptr)) continue;
        if (!accepted) { best_score = score; winning = win; }
        reassignPlanetNames(&move,original);
        if (accepted) choices += ",";
        choices += "{\"move\":" + json_string(move.toString()) + ",\"review\":" + inspect_position(after,player) + "}";
        if (++accepted == 3) break;
    }
    result = "{\"choices\":[" + choices + "],\"current\":" + current + ",\"baseline\":" + baseline + ",\"baselineMove\":" + json_string(native_best.toString()) +
        ",\"checked\":" + std::to_string(checked) + ",\"limited\":" + (limited?"true":"false") + "}";
    return result.c_str();
}

extern "C" const char *choose_move(const char *text, int player) {
    GameState st;
    if ((player != 0 && player != 1) || !st.scan(text) || st.gameIsOver()) {
        result = "ERROR: Invalid playing position";
    } else {
        result = get_ai_move(st, player).toString();
    }
    return result.c_str();
}

// Lower levels deliberately deviate from the original ranked choice. Level 10
// calls the untouched upstream selector, including its winning-reply checks.
extern "C" const char *choose_move_level(const char *text, int player, unsigned seed, int level) {
    if (level < 1 || level > 10) { result = "ERROR: Invalid difficulty"; return result.c_str(); }
    if (level == 10) return choose_move(text, player);
    GameState st;
    if ((player != 0 && player != 1) || !st.scan(text) || st.gameIsOver()) {
        result = "ERROR: Invalid playing position";
        return result.c_str();
    }
    std::srand(seed);
    const int weakness = 10-level;
    // Nine percent more deliberate mistakes for each step down in difficulty.
    if (std::rand()%100 >= weakness*9) return choose_move(text, player);
    auto moves = get_all_moves_sorted_by_value(st, player, false);
    const int n = moves.size();
    if (n == 0) return choose_move(text, player);
    const int pool = std::min(n, std::max(2, (weakness*weakness*n)/81));
    const int rank = pool > 1 ? 1 + std::rand()%(pool-1) : 0;
    WholeMove chosen = std::move(moves[rank]);
    reassignPlanetNames(&chosen, st);
    result = chosen.toString();
    return result.c_str();
}

// The native CLI's setup_ai algorithm, without its terminal input/output.
extern "C" const char *choose_setup(const char *text, int attacker, unsigned seed) {
    GameState st;
    if (attacker != 0 && attacker != 1) { result = "ERROR: Invalid player"; return result.c_str(); }
    if (*text) {
        if (!st.scan(text)) { result = "ERROR: Invalid setup"; return result.c_str(); }
    } else st.newGame();
    if (st.homeworldOf(attacker)) { result = "ERROR: Homeworld already exists"; return result.c_str(); }
    std::srand(seed);
    st.stars.emplace_back("Bot");
    StarSystem &hw = st.stars.back();
    hw.homeworldOf = attacker;
    const StarSystem *opponent_hw = st.homeworldOf(1-attacker);
    while (true) {
        hw.star.clear(); hw.ships[attacker].clear();
        const Color c1 = (std::rand()%2 == 0 ? YELLOW : BLUE);
        const Color c2 = Color((1+std::rand()%3+(int)c1)%4);
        const Size s1 = Size(std::rand()%3);
        const Size s2 = Size((s1+1+std::rand()%2)%3);
        hw.star.insert(c1,s1);hw.star.insert(c2,s2);
        if (opponent_hw && opponent_hw->star.numberOf(s1)==opponent_hw->star.numberOf(s2)) continue;
        const Color shipc = (c2 != GREEN) ? GREEN : (c1 == YELLOW) ? BLUE : YELLOW;
        hw.ships[attacker].insert(shipc,LARGE);
        if (!st.stash.contains(hw.pieceCollection())) continue;
        break;
    }
    st.stash -= hw.star; st.stash -= hw.ships[attacker];
    result = hw.toString();
    return result.c_str();
}
