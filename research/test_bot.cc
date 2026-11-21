#include "bot.h"
#include "AllMoves.h"
#include "ApplyMove.h"
#include <algorithm>
#include <cassert>
#include <cmath>
#include <iostream>

static GameState position(const char* text) {
    GameState st;
    assert(st.scan(text));
    return st;
}
static double brute(const GameState& st,int p,int depth) {
    if (!depth || st.gameIsOver()) return research::evaluate(st,p,research::baseline_weights);
    double best=-2e6;
    findAllMoves(st,p,false,false,0xF,[&](const WholeMove&,const GameState& next){
        best=std::max(best,-brute(next,1-p,depth-1));
        return best==1e6;
    });
    return best;
}
int main() {
    const auto opening=position("Alpha (0, r1b2) g3-\nBeta (1, r2b3) -g3\n");
    const auto renamed=position("Second (1, r2b3) -g3\nFirst (0, r1b2) g3-\n");
    assert(research::position_key(opening,0)==research::position_key(renamed,0));
    assert(research::position_key(opening,0)!=research::position_key(opening,1));
    for (int p=0;p<2;++p) {
        auto f=research::features(opening,p), g=research::features(opening,1-p);
        for (std::size_t i=0;i<f.size();++i) assert(f[i]==-g[i]);
    }
    research::Options opts;
    opts.time_ms=0; opts.max_depth=2;
    for (int p=0;p<2;++p) {
        auto r=research::choose_move(opening,p,research::baseline_weights,opts);
        assert(r.depth==2 && !r.interrupted);
        assert(ApplyMove::isValidMove(opening,p,r.move));
        assert(std::abs(r.score-brute(opening,p,2))<1e-7);
        auto no_tt=opts;
        no_tt.transpositions=false; no_tt.move_ordering=false;
        auto result=research::choose_move(opening,p,research::baseline_weights,no_tt);
        assert(std::abs(result.score-r.score)<1e-7);
        std::cout<<"depth-2 exact reference; player "<<p
                 <<": nodes="<<r.nodes<<", unordered="<<result.nodes<<"\n";
    }
    // Midgame position with sacrifice options, neutral systems and a contested fleet.
    const auto midgame=position("A (0, r1b2) g3y1-\nB (1, y2b3) -g3r1\n"
                                "C (g1) b2-y1\nD (r3) g1-\n");
    for (int p=0;p<2;++p) {
        auto r=research::choose_move(midgame,p,research::baseline_weights,opts);
        assert(r.depth==2 && ApplyMove::isValidMove(midgame,p,r.move));
        assert(std::abs(r.score-brute(midgame,p,2))<1e-7);
        std::cout<<"midgame depth-2 reference; player "<<p<<": nodes="<<r.nodes
                 <<", generated="<<r.generated<<"\n";
    }
    const auto winning=position("Alpha (0, b1r2) g3-\nBeta (1, y1b2) r3-g1\n");
    auto r=research::choose_move(winning,0,research::baseline_weights,opts);
    auto after=winning;
    assert(ApplyMove::Whole(after,0,r.move)==ApplyMove::SUCCESS);
    assert(after.hasLost(1) && !after.hasLost(0));
    assert(research::evaluate(after,0,research::baseline_weights)==1e6);
    assert(research::evaluate(after,1,research::baseline_weights)==-1e6);
    research::Options tiny;
    tiny.time_ms=0; tiny.node_limit=1; tiny.max_depth=5;
    r=research::choose_move(opening,0,research::baseline_weights,tiny);
    assert(r.interrupted && r.depth==1 && ApplyMove::isValidMove(opening,0,r.move));
    tiny.node_limit=0; tiny.generated_limit=200;
    r=research::choose_move(midgame,0,research::baseline_weights,tiny);
    const auto again=research::choose_move(midgame,0,research::baseline_weights,tiny);
    assert(r.generated<=200 && r.generated==again.generated);
    assert(r.move.toString()==again.move.toString() && r.depth==again.depth && r.score==again.score);
    assert(ApplyMove::isValidMove(midgame,0,r.move));
    std::cout<<"PASS: canonical position key, zero-sum features, exact minimax, "
             <<"terminal win, legal fallback under interrupted search.\n";
}
