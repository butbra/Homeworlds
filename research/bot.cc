#include "bot.h"
#include "AllMoves.h"
#include "ApplyMove.h"
#include "PlanetNames.h"
#include <algorithm>
#include <chrono>
#include <cmath>
#include <stdexcept>
#include <unordered_map>
#include <vector>

namespace research {
const std::array<const char*, feature_count> feature_names = {
    "ships", "fleet_pips", "home_defenders", "home_max_size", "home_invasion",
    "local_color_access", "mobility", "catastrophe_safety", "enemy_home_pressure",
    "build_access"
};
const Weights baseline_weights = {10, 5, 12, 8, 18, 2, 1, 14, 4, 3};
constexpr double win = 1e6;

static Weights measure(const GameState& st, int p) {
    Weights f{};
    const auto* home = st.homeworldOf(p);
    const auto* enemy_home = st.homeworldOf(1-p);
    for (const auto& sys : st.stars) {
        const auto& fleet = sys.ships[p];
        const auto& opponent = sys.ships[1-p];
        const int n = fleet.number();
        if (sys.homeworldOf == p) {
            f[2] = n;
            f[3] = n ? 1 + int(fleet.biggestSize()) : 0;
            for (Size s = SMALL; s <= LARGE; ++s)
                f[4] -= (1 + int(s)) * opponent.numberOf(s);
        }
        if (!n) continue;
        f[0] += n;
        for (Size s = SMALL; s <= LARGE; ++s)
            f[1] += (1 + int(s)) * fleet.numberOf(s);
        for (Color c = RED; c <= BLUE; ++c) {
            if (sys.playerHasAccessTo(p,c)) ++f[5];
            if (sys.playerHasAccessTo(p,GREEN) && fleet.numberOf(c)
                && st.stash.numberOf(c)) ++f[9];
            const int count = sys.numberOf(c);
            if (count >= 3) {
                const double multiplier = count >= 4 ? 1.0 : 0.25;
                double exposure = fleet.numberOf(c);
                // Losing the last star or last home defender is especially costly.
                if (sys.star.numberOf(c) == sys.star.number()) exposure += n;
                if (&sys == home && (fleet.numberOf(c) == n
                    || sys.star.numberOf(c) == sys.star.number())) exposure += 3;
                f[7] -= multiplier * exposure;
            }
        }
        if (sys.playerHasAccessTo(p,YELLOW)) {
            for (const auto& dest : st.stars)
                if (&dest != &sys && sys.isAdjacentTo(dest)) ++f[6];
            for (Size s = SMALL; s <= LARGE; ++s)
                if (!sys.star.numberOf(s) && st.stash.numberOf(s)) ++f[6];
        }
        if (enemy_home && &sys == enemy_home) f[8] += 2 * n;
        else if (enemy_home && sys.isAdjacentTo(*enemy_home)
                 && sys.playerHasAccessTo(p,YELLOW)) f[8] += n;
    }
    return f;
}
Weights features(const GameState& st, int p) {
    const auto a = measure(st,p), b = measure(st,1-p);
    Weights diff{};
    for (std::size_t i=0; i<feature_count; ++i) diff[i] = a[i]-b[i];
    return diff;
}
double evaluate(const GameState& st, int p, const Weights& w) {
    const bool a = st.hasLost(p), b = st.hasLost(1-p);
    if (a || b) return a == b ? 0 : a ? -win : win;
    const auto f = features(st,p);
    double v=0;
    for (std::size_t i=0;i<feature_count;++i) v += w[i]*f[i];
    return std::clamp(v,-win/2,win/2);
}
std::string position_key(const GameState& st, int p) {
    // Names and vector ordering are immaterial; stash follows from conservation.
    std::string key = std::to_string(p) + "|";
    for (int i=0;i<2;++i) {
        const auto* h=st.homeworldOf(i);
        key += h ? h->toComparableString() : "!";
        key += '|';
    }
    std::vector<std::string> others;
    for (const auto& sys : st.stars)
        if (sys.homeworldOf == -1) others.push_back(sys.toComparableString());
    std::sort(others.begin(),others.end());
    for (const auto& s: others) key += s + '|';
    return key;
}

namespace {
using Clock = std::chrono::steady_clock;
enum class Bound { exact, lower, upper };
struct Entry { int depth; double value; Bound bound; std::string child; };
struct Child { WholeMove move; GameState state; double score; std::string key; };
struct Search {
    const Weights& weights;
    const Options& options;
    const Clock::time_point start=Clock::now();
    SearchResult result;
    std::unordered_map<std::string,Entry> table;
    Search(const Weights& w,const Options& o): weights(w),options(o) {}
    bool stop() {
        return (options.time_ms > 0 && Clock::now()-start >=
                std::chrono::milliseconds(options.time_ms)) ||
               (options.node_limit && result.nodes >= options.node_limit) ||
               (options.generated_limit && result.generated >= options.generated_limit);
    }
    std::vector<Child> generate(const GameState& st,int p,bool& complete) {
        std::vector<Child> moves;
        complete=true;
        // Reuse successor generation only, never Quux's evaluator or selector.
        findAllMoves(st,p,false,false,0xF,[&](const WholeMove& m,const GameState& after){
            ++result.generated;
            double score=evaluate(after,p,weights);
            moves.push_back({m,after,score,position_key(after,1-p)});
            if (score==win) return true; // terminal win dominates all alternatives
            if (stop()) { complete=false; return true; }
            return false;
        });
        return moves;
    }
    void order(std::vector<Child>& moves,const std::string& hint) {
        if (options.move_ordering) {
            std::stable_sort(moves.begin(),moves.end(),[&](const Child& a,const Child& b){
                if ((a.key==hint)!=(b.key==hint)) return a.key==hint;
                return a.score>b.score;
            });
        }
    }
    // False indicates incomplete search; never cache or use it as an exact result.
    bool search(const GameState& st,int p,int depth,double alpha,double beta,double& value) {
        if (stop()) return false;
        ++result.nodes;
        if (!depth || st.gameIsOver()) { value=evaluate(st,p,weights); return true; }
        std::string key=position_key(st,p), hint;
        const auto original_alpha=alpha, original_beta=beta;
        if (options.transpositions) {
            auto it=table.find(key);
            if (it!=table.end()) {
                hint=it->second.child;
                const auto& e=it->second;
                if (e.depth>=depth) {
                    ++result.tt_hits;
                    if (e.bound==Bound::exact) { value=e.value; return true; }
                    if (e.bound==Bound::lower) alpha=std::max(alpha,e.value);
                    else beta=std::min(beta,e.value);
                    if (alpha>=beta) { value=e.value; return true; }
                }
            }
        }
        bool complete;
        auto children=generate(st,p,complete);
        if (!complete || children.empty()) return false;
        order(children,hint);
        double best=-2*win;
        std::string best_key;
        for (const auto& c:children) {
            double v;
            if (!search(c.state,1-p,depth-1,-beta,-alpha,v)) return false;
            v=-v;
            if (v>best) { best=v; best_key=c.key; }
            alpha=std::max(alpha,v);
            if (alpha>=beta || best==win) { ++result.cutoffs; break; }
        }
        value=best;
        if (options.transpositions && table.size()<200000) {
            const Bound b=best<=original_alpha ? Bound::upper :
                best>=original_beta ? Bound::lower : Bound::exact;
            auto it=table.find(key);
            if (it==table.end() || it->second.depth<=depth)
                table[key]={depth,best,b,best_key};
        }
        return true;
    }
    SearchResult run(const GameState& st,int p) {
        bool complete;
        auto children=generate(st,p,complete);
        if (children.empty()) throw std::runtime_error("move generator returned no successors");
        auto best=std::max_element(children.begin(),children.end(),[](const Child& a,const Child& b){
            return a.score<b.score;
        });
        result.move=best->move;
        result.score=best->score;
        std::string preferred=best->key;
        if (complete) result.depth=1;
        for (int d=2; complete && d<=options.max_depth && result.score!=win && !stop(); ++d) {
            order(children,preferred);
            double best_value=-2*win;
            const Child* choice=nullptr;
            for (const auto& c:children) {
                double v;
                if (!search(c.state,1-p,d-1,-2*win,-best_value,v)) {
                    complete=false;
                    break;
                }
                v=-v;
                if (v>best_value) { best_value=v; choice=&c; }
                if (best_value==win) break;
            }
            if (complete && choice) {
                result.move=choice->move;
                result.score=best_value;
                result.depth=d;
                preferred=choice->key;
            }
        }
        result.interrupted=!complete || (result.depth<options.max_depth && result.score!=win && stop());
        reassignPlanetNames(&result.move,st);
        // The upstream generator may attach more actions after a winning
        // catastrophe. When a defeated homeworld has no ships, native
        // application may release its surviving stars earlier than the
        // browser's Rules13 reducer. Never execute superfluous suffixes:
        // take the earliest complete, native-legal winning prefix.
        if (result.score==win) {
            WholeMove prefix;
            for (const auto& action: result.move.actions) {
                prefix += action;
                GameState next=st;
                if (ApplyMove::Whole(next,p,prefix)==ApplyMove::SUCCESS
                        && next.hasLost(1-p) && !next.hasLost(p)) {
                    result.move=prefix;
                    break;
                }
            }
        }
        if (!ApplyMove::isValidMove(st,p,result.move))
            throw std::runtime_error("selected turn failed rules validation");
        result.elapsed_ms=std::chrono::duration<double,std::milli>(Clock::now()-start).count();
        return result;
    }
};
}
SearchResult choose_move(const GameState& st,int p,const Weights& w,const Options& opts) {
    if (p<0 || p>1 || st.gameIsOver() || opts.max_depth<1 || opts.time_ms<0)
        throw std::invalid_argument("invalid search options or terminal position");
    for (double weight:w) if (!std::isfinite(weight))
        throw std::invalid_argument("nonfinite weight");
    return Search{w,opts}.run(st,p);
}
}
