#include "bot.h"
#include "AI.h"
#include "ApplyMove.h"
#include "PlanetNames.h"
#include <chrono>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <iterator>
#include <set>
#include <sstream>
#include <stdexcept>

static std::string quote(const std::string& s) {
    std::string out="\"";
    for (char c:s) {
        if (c=='\n') out+="\\n";
        else if (c=='\r') out+="\\r";
        else if (c=='\t') out+="\\t";
        else {
            if (c=='\\' || c=='"') out+='\\';
            out+=c;
        }
    }
    return out+'"';
}
static research::Weights parse_weights(const std::string& csv) {
    research::Weights w;
    std::istringstream input(csv);
    std::string value;
    for (auto& x:w) {
        if (!std::getline(input,value,',')) throw std::invalid_argument("need ten weights");
        std::size_t n;
        x=std::stod(value,&n);
        if (n!=value.size() || !std::isfinite(x)) throw std::invalid_argument("invalid weight");
    }
    if (std::getline(input,value,',')) throw std::invalid_argument("too many weights");
    return w;
}
int main(int argc,char** argv) {
    try {
        if (argc<3) throw std::invalid_argument("usage: hwbot choose|quux|apply|key|features PLAYER [time_ms depth weights_csv]");
        const std::string cmd=argv[1];
        const int p=std::stoi(argv[2]);
        if (p!=0 && p!=1) throw std::invalid_argument("player must be 0 or 1");
        std::string input((std::istreambuf_iterator<char>(std::cin)), {});
        GameState st;
        if (!st.scan(input.c_str())) throw std::invalid_argument("invalid position");
        std::set<std::string> names;
        int homes[2]={0,0};
        for (const auto& s:st.stars) {
            if (s.name.empty() || !names.insert(s.name).second || s.star.empty())
                throw std::invalid_argument("position requires distinct named, nonempty stars");
            if (s.homeworldOf>=0 && ++homes[s.homeworldOf]>1)
                throw std::invalid_argument("duplicate homeworld");
        }
        std::cout<<std::setprecision(12);
        if (cmd=="key") {
            std::cout<<quote(research::position_key(st,p))<<"\n";
            return 0;
        }
        if (cmd=="features") {
            const auto f=research::features(st,p);
            std::cout<<"{";
            for (std::size_t i=0;i<f.size();++i)
                std::cout<<(i?",":"")<<quote(research::feature_names[i])<<":"<<f[i];
            std::cout<<"}\n";
            return 0;
        }
        if (st.gameIsOver()) throw std::invalid_argument("position already terminal");
        if (cmd=="apply") {
            if (argc!=4) throw std::invalid_argument("apply requires move string");
            WholeMove m;
            if (!m.scan(argv[3]) || ApplyMove::Whole(st,p,m)!=ApplyMove::SUCCESS)
                throw std::invalid_argument("illegal move");
            const int outcome=st.hasLost(0)? (st.hasLost(1)?2:1):st.hasLost(1)?0:-1;
            std::cout<<"{\"state\":"<<quote(st.toString())<<",\"outcome\":"<<outcome
                     <<",\"key\":"<<quote(research::position_key(st,1-p))<<"}\n";
            return 0;
        }
        auto start=std::chrono::steady_clock::now();
        research::SearchResult r;
        if (cmd=="quux") {
            r.move=get_ai_move(st,p);
            r.elapsed_ms=std::chrono::duration<double,std::milli>(
                std::chrono::steady_clock::now()-start).count();
        } else if (cmd=="choose") {
            if (argc<5 || argc>6) throw std::invalid_argument("choose requires time_ms depth [weights_csv]");
            research::Options opt;
            opt.time_ms=std::stoi(argv[3]);
            opt.max_depth=std::stoi(argv[4]);
            const auto weights=argc==6?parse_weights(argv[5]):research::baseline_weights;
            r=research::choose_move(st,p,weights,opt);
        } else throw std::invalid_argument("unknown command");
        GameState next=st;
        if (ApplyMove::Whole(next,p,r.move)!=ApplyMove::SUCCESS)
            throw std::runtime_error("engine returned illegal turn");
        const int outcome=next.hasLost(0)? (next.hasLost(1)?2:1):next.hasLost(1)?0:-1;
        std::cout<<"{\"move\":"<<quote(r.move.toString())<<",\"state\":"<<quote(next.toString())
                 <<",\"key\":"<<quote(research::position_key(next,1-p))<<",\"outcome\":"<<outcome
                 <<",\"score\":"<<r.score<<",\"depth\":"<<r.depth<<",\"nodes\":"<<r.nodes
                 <<",\"generated\":"<<r.generated<<",\"cutoffs\":"<<r.cutoffs
                 <<",\"tt_hits\":"<<r.tt_hits<<",\"elapsed_ms\":"<<r.elapsed_ms
                 <<",\"interrupted\":"<<(r.interrupted?"true":"false")<<"}\n";
    } catch (const std::exception& e) {
        std::cerr<<e.what()<<"\n";
        return 1;
    }
}
