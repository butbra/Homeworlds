"""Pure Python regression checks for experimental design and score accounting."""
import unittest
from evolve import BASE, fitness, individual, normalize, opening_matches
from make_openings import generate, key


class ResearchTests(unittest.TestCase):
    def test_disjoint_openings_and_seed_reproducibility(self):
        excluded={key("Alpha (0, r1b2) g3-\nBeta (1, r2b3) -g3\n")}
        counts={"train":24,"validation":8,"final":50}
        a=generate(5511,counts,excluded)
        self.assertEqual(a,generate(5511,counts,excluded))
        keys=[key(s) for values in a.values() for s in values]
        self.assertEqual(len(set(keys)),sum(counts.values()))
        self.assertFalse(set(keys)&excluded)
        self.assertEqual(key("A (0, r1b2) g3-\nB (1, r2b3) -g3\n"),
                         key("B (0, b3r2) g3-\nA (1, b2r1) -g3\n"))

    def test_pair_assignments(self):
        a,b=individual("a",BASE),individual("b",BASE)
        schedule=opening_matches(a,b,"opening",0)
        self.assertEqual(len(schedule),4)
        self.assertEqual({(m["players"][0]["id"],m["first"]) for m in schedule},
                         {("a",0),("a",1),("b",0),("b",1)})

    def test_fitness_and_error_accounting(self):
        games=[{"identities":["a","b"],"status":s,"winner":w}
               for s,w in [("win",0),("win",1),("draw",None),("repetition",None),
                           ("turn_limit",None),("timeout",None),("engine_error",None)]]
        result=fitness(games,["a","b"])
        for s in result.values():
            self.assertEqual(s["scheduled"],7)
            self.assertEqual(s["valid"],5)
            self.assertEqual(s["fitness"],0.5)
            self.assertEqual(s["wins"],1)
            self.assertEqual(s["losses"],1)

    def test_weight_scale(self):
        a=normalize([w*2 for w in BASE])
        self.assertEqual(a,list(BASE))
        self.assertAlmostEqual(sum(normalize([i+1 for i in range(10)])),sum(BASE),places=5)
        with self.assertRaises(ValueError):
            normalize([0]*10)


if __name__=="__main__":
    unittest.main()
