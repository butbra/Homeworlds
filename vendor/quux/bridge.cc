#include "state.h"
#include "AI.h"
#include <cstdlib>
#include <string>

static std::string result;
extern "C" const char *choose_move(const char *text, int player) {
    GameState st;
    if ((player != 0 && player != 1) || !st.scan(text) || st.gameIsOver()) {
        result = "ERROR: Invalid playing position";
    } else {
        result = get_ai_move(st, player).toString();
    }
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
