/**
 * EquiNOVA Mastermind Auto-Bet — Edge Function
 *
 * Called after mastermind-scanner identifies pattern matches on Top Picks.
 * For users with auto_bet_enabled = true, places bets on qualifying
 * Top Picks that match >= 1 ACTIVE pattern and are NOT vetoed.
 *
 * Uses Kelly staking from ensemble_proba + opening_odds.
 * Respects bankroll limits.
 */

Deno.serve(async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: cors });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return json({ error: "No authorization header" }, 401);
    }
    const token = authHeader.replace("Bearer ", "");

    // Verify user
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: supabaseKey },
    });
    if (!userRes.ok) return json({ error: "Invalid auth" }, 401);
    const user = await userRes.json();
    const userId = user.id;

    // Check if auto-bet is enabled
    const settingsUrl = `${supabaseUrl}/rest/v1/user_auto_bet_settings?user_id=eq.${userId}&select=auto_bet_enabled`;
    const settingsRes = await fetch(settingsUrl, {
      headers: { Authorization: `Bearer ${supabaseKey}`, apikey: supabaseKey },
    });
    const settings = settingsRes.ok ? await settingsRes.json() : [];
    const autoBetEnabled = settings.length > 0 && settings[0].auto_bet_enabled;

    if (!autoBetEnabled) {
      return json({
        data: { bets_placed: 0, message: "Auto-bet is disabled" },
      });
    }

    // Get request body with matches
    const body = await req.json().catch(() => ({}));
    const matches = body.matches || [];

    if (matches.length === 0) {
      return json({ data: { bets_placed: 0, message: "No matches provided" } });
    }

    // Get user bankroll
    const bankrollUrl = `${supabaseUrl}/rest/v1/user_bankroll?user_id=eq.${userId}&select=balance`;
    const bankrollRes = await fetch(bankrollUrl, {
      headers: { Authorization: `Bearer ${supabaseKey}`, apikey: supabaseKey },
    });
    const bankrollData = bankrollRes.ok ? await bankrollRes.json() : [];
    const bankroll =
      bankrollData.length > 0 ? parseFloat(bankrollData[0].balance) || 0 : 0;

    if (bankroll <= 0) {
      return json({
        data: { bets_placed: 0, message: "Insufficient bankroll" },
      });
    }

    const betsPlaced: any[] = [];
    let remainingBankroll = bankroll;

    for (const match of matches) {
      // Only bet on matches with ACTIVE patterns and no veto
      const activePatterns = (match.matching_patterns || []).filter(
        (p: any) => p.status === "ACTIVE" && p.pattern_type === "PROFITABLE"
      );
      if (activePatterns.length === 0 || match.is_vetoed) continue;

      const ensProba = parseFloat(match.ensemble_proba) || 0;
      const odds = parseFloat(match.opening_odds || match.current_odds) || 0;

      if (ensProba < 0.15 || odds <= 1 || odds > 13.0) continue;

      // Kelly criterion
      const impliedProb = 1 / odds;
      const edge = ensProba - impliedProb;
      if (edge < 0.05) continue;

      const kellyFraction = edge / (odds - 1);
      const quarterKelly = kellyFraction * 0.25;
      let stake = Math.round(remainingBankroll * quarterKelly * 2) / 2; // Round to nearest 50p

      if (stake < 1) continue;
      stake = Math.min(stake, remainingBankroll * 0.05); // Max 5% of bankroll per bet
      if (stake > remainingBankroll) continue;

      // Place bet via place-bet edge function pattern
      const betData = {
        horse_name: match.horse_name,
        horse_id: match.horse_id,
        race_id: match.race_id,
        course: match.course,
        off_time: match.off_time,
        trainer_name: match.trainer,
        jockey_name: match.jockey,
        current_odds: odds,
        bet_amount: stake,
        odds: odds,
        bet_type: "win",
      };

      const placeBetUrl = `${supabaseUrl}/functions/v1/place-bet`;
      const betRes = await fetch(placeBetUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: supabaseKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(betData),
      });

      if (betRes.ok) {
        remainingBankroll -= stake;
        betsPlaced.push({
          horse_name: match.horse_name,
          race_id: match.race_id,
          stake,
          odds,
          patterns_matched: activePatterns.length,
        });

        // Record in match history
        for (const pat of activePatterns) {
          const histUrl = `${supabaseUrl}/rest/v1/mastermind_match_history`;
          await fetch(histUrl, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${supabaseKey}`,
              apikey: supabaseKey,
              "Content-Type": "application/json",
              Prefer: "return=minimal",
            },
            body: JSON.stringify({
              pattern_id: pat.pattern_id,
              race_date: new Date().toLocaleDateString("en-CA", {
                timeZone: "Europe/London",
              }),
              race_id: match.race_id,
              horse_id: match.horse_id,
              horse_name: match.horse_name,
              odds_at_match: odds,
              result: "PENDING",
              profit: 0,
              was_auto_bet: true,
            }),
          });
        }

        console.log(
          `Auto-bet placed: ${match.horse_name} @ ${odds} - £${stake} (${activePatterns.length} patterns)`
        );
      } else {
        console.error(
          `Failed to place bet for ${match.horse_name}: ${betRes.status}`
        );
      }
    }

    return json({
      data: {
        bets_placed: betsPlaced.length,
        bets: betsPlaced,
        remaining_bankroll: remainingBankroll,
      },
    });
  } catch (err) {
    console.error("mastermind-auto-bet error:", err);
    return json({ error: String(err) }, 500);
  }
});
