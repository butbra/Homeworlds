CXX ?= g++
CXXFLAGS ?= -std=c++17 -O3 -Wall -Wextra
VENDOR = ../vendor/quux
RULES = $(addprefix $(VENDOR)/,AllMoves.cc ApplyMove.cc GameState.cc PieceCollection.cc PlanetNames.cc SingleAction.cc StarSystem.cc WholeMove.cc mprintf.cc)
QUUX = $(addprefix $(VENDOR)/,AIMove.cc AIStaticEval.cc)
HEADERS = bot.h $(wildcard $(VENDOR)/*.h)
.PHONY: all test clean
all: build/hwbot
build:
	mkdir -p build
build/hwbot: bot.cc main.cc $(RULES) $(QUUX) $(HEADERS) | build
	$(CXX) $(CXXFLAGS) -I$(VENDOR) bot.cc main.cc $(RULES) $(QUUX) -o $@
build/test_bot: bot.cc test_bot.cc $(RULES) $(HEADERS) | build
	$(CXX) $(CXXFLAGS) -I$(VENDOR) bot.cc test_bot.cc $(RULES) -o $@
test: build/test_bot build/hwbot
	./build/test_bot
clean:
	$(RM) build/hwbot build/test_bot
