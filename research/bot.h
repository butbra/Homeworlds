#pragma once
#include "state.h"
#include "WholeMove.h"
#include <array>
#include <cstdint>
#include <string>

namespace research {
// Every feature is a zero-sum difference, positive for the requested player.
constexpr std::size_t feature_count = 10;
using Weights = std::array<double, feature_count>;
extern const std::array<const char*, feature_count> feature_names;
extern const Weights baseline_weights;
Weights features(const GameState& state, int player);
double evaluate(const GameState& state, int player, const Weights& weights);
std::string position_key(const GameState& state, int player);

struct Options {
    int time_ms = 1000;
    int max_depth = 8;
    std::uint64_t node_limit = 0; // 0 = unlimited; useful for reproducible tests.
    bool transpositions = true;
    bool move_ordering = true;
};
struct SearchResult {
    WholeMove move;
    double score = 0;
    int depth = 0;
    std::uint64_t nodes = 0, generated = 0, cutoffs = 0, tt_hits = 0;
    double elapsed_ms = 0;
    bool interrupted = false;
};
SearchResult choose_move(const GameState& state, int player,
                         const Weights& weights, const Options& options = {});
}
