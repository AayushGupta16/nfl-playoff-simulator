import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export const Methodology: React.FC = () => {
  return (
    <div className="max-w-3xl mx-auto pb-12">
      <div className="mb-6">
        <Link to="/" className="text-blue-600 font-medium text-sm flex items-center gap-1 hover:underline">
          <ArrowLeft className="w-4 h-4" />
          Back to Simulator
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-8 py-10 border-b border-slate-100 bg-slate-50/50 text-center">
            <h1 className="text-3xl font-bold text-slate-900 mb-2">How This Works</h1>
            <p className="text-slate-600">Thousands of simulated seasons, tallied up.</p>
          </div>

        <div className="p-8 space-y-10 text-slate-800 leading-relaxed">
          
          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">The Simulation</h2>
            <p className="mb-4">
              The simulator runs the rest of the NFL season 10,000 times (configurable). Each game is decided by a weighted coin flip based on win probability. After all games, the simulator applies tiebreakers to determine playoff seeding.
            </p>
            <p className="text-slate-600">
              If a team makes the playoffs in 8,400 of 10,000 simulations → 84% playoff probability.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">Game Outcomes</h2>
            <p className="mb-6">
              The simulator uses real-money prediction markets from <a href="https://kalshi.com" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Kalshi</a> for everything. It does not maintain its own "power rankings" or predictive model.
            </p>

            <div className="space-y-4">
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <h3 className="font-bold text-slate-900 mb-1">1. Direct Market Odds</h3>
                <p className="text-sm text-slate-600">
                  For upcoming games where a market exists (~2 weeks out), the simulator uses the exact win probability from Kalshi.
                </p>
              </div>

              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <h3 className="font-bold text-slate-900 mb-1">2. Kalshi-Implied Elo</h3>
                <p className="text-sm text-slate-600 mb-3">
                  For future games without markets (e.g. Week 18), the simulator calculates win probability using a "Kalshi-Implied Elo." This is derived directly from each team's <strong>Season Win Total</strong> market.
                </p>
                <p className="text-sm text-slate-600 mb-3">
                  If the market expects the Chiefs to win 12.5 games, the simulator converts that number into an Elo rating (~1612). This ensures that the long-term simulations align with what the market believes about each team's strength, pricing in injuries, schedule difficulty, and roster talent automatically.
                </p>
                <code className="block bg-slate-800 text-slate-200 p-3 rounded text-sm font-mono">
                  Elo = 1500 + (ExpectedWins - 8.5) * 28
                </code>
              </div>

              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <h3 className="font-bold text-slate-900 mb-1">3. Dynamic Simulation (Momentum)</h3>
                <p className="text-sm text-slate-600 mb-3">
                  The simulator runs through the remaining schedule week-by-week. After every simulated game, it updates the winner's Elo rating slightly (and lowers the loser's).
                </p>
                <p className="text-sm text-slate-600">
                  This models <strong>momentum</strong>: if a team exceeds expectations in Week 14, they become slightly stronger for Week 15.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">Tiebreakers</h2>
            <p className="mb-4 text-slate-600">
              The simulator implements the main early/mid NFL tiebreaker steps (records, common games, SOV, SOS). When a team is eliminated, it restarts from step 1 (per NFL rules), and if everything is still tied it falls back to a coin toss.
            </p>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-bold text-slate-900 border-b border-slate-200 pb-2 mb-2">Division Ties</h3>
                <ol className="list-decimal pl-5 text-sm text-slate-700 space-y-1">
                  <li>Head-to-head record</li>
                  <li>Division record</li>
                  <li>Common games (min 4)</li>
                  <li>Conference record</li>
                  <li>Strength of Victory</li>
                  <li>Strength of Schedule</li>
                  <li>Coin toss</li>
                </ol>
              </div>
              <div>
                <h3 className="font-bold text-slate-900 border-b border-slate-200 pb-2 mb-2">Wildcard Ties</h3>
                <ol className="list-decimal pl-5 text-sm text-slate-700 space-y-1">
                  <li>Head-to-head (sweep for 3+)</li>
                  <li>Conference record</li>
                  <li>Common games (min 4)</li>
                  <li>Strength of Victory</li>
                  <li>Strength of Schedule</li>
                  <li>Coin toss</li>
                </ol>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-4">
              I skip the later point-based and \"combined ranking\" tiebreaker steps from the official rules (various net-points rules, net touchdowns). Those are rare edge cases in practice.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">What the Numbers Mean</h2>
            <ul className="space-y-3 text-slate-700">
              <li className="flex gap-3">
                <span className="font-bold text-slate-900 whitespace-nowrap w-28 shrink-0">Make Playoffs</span>
                <span>% of simulations where team gets any playoff spot.</span>
              </li>
              <li className="flex gap-3">
                <span className="font-bold text-slate-900 whitespace-nowrap w-28 shrink-0">Win Div</span>
                <span>% of simulations where team finishes 1st in division.</span>
              </li>
              <li className="flex gap-3">
                <span className="font-bold text-slate-900 whitespace-nowrap w-28 shrink-0">Wildcard</span>
                <span>% of simulations where team gets a wildcard spot (seeds 5-7).</span>
              </li>
              <li className="flex gap-3">
                <span className="font-bold text-slate-900 whitespace-nowrap w-28 shrink-0">1st Seed</span>
                <span>% of simulations where team gets the bye (top seed in conference).</span>
              </li>
            </ul>
          </section>

          <section className="border-t border-slate-200 pt-6">
            <h2 className="text-lg font-bold text-slate-900 mb-2">Limitations</h2>
            <ul className="text-sm text-slate-600 space-y-1 list-disc pl-5">
              <li>Elo parameters (home field, K-factor) are borrowed, not calibrated</li>
              <li>No real-time injury/news integration</li>
              <li>Some rare tiebreaker steps are approximated</li>
              <li>Simulation count affects precision (more iterations = more precise)</li>
            </ul>
            <p className="text-sm text-slate-500 mt-4">
              Open source, MIT licensed. Use for fun, not for betting.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};
