/**
 * EquiNOVA Mastermind Auto-Bet -- Edge Function
 *
 * When auto-bet is toggled ON, the frontend sends today's Strong picks
 * (trust >= 70). This function places Kelly-sized bets on each,
 * respecting bankroll limits and preventing duplicate bets.
 *
 * Trust-driven Kelly multiplier (matches frontend getTrustMultiplier):
 *   trust 80+  = 1.5x quarter-Kelly (elite)
 *   trust 60-79 = 1.0x (high)
 *   trust 30-59 = 0.5x (medium)
 *   trust <30   = 0.25x (low)
 *
 * Safety: duplicate check, bankroll cap, 5% max per bet, trust >= 70 gate.
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
    const svcHdrs: Record<string, string> = {
      Authorization: `Bearer ${supabaseKey}`,
      apikey: supabaseKey,
      "Content-Type": "application/json",
    };

    // -- Auth --
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return json({ error: "No authorization header" }, 401);
    const token = authHeader.replace("Bearer ", "");

    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: supabaseKey },
    });
    if (!userRes.ok) return json({ error: "Invalid auth" }, 401);
    const user = await userRes.json();
    const userId = user.id;

    // -- Check auto-bet enabled --
    const settingsRes = await fetch(
      `${supabaseUrl}/rest/v1/user_auto_bet_settings?user_id=eq.${userId}&select=auto_bet_enabled`,
      { headers: svcHdrs }
    );
    const settings = settingsRes.ok ? await settingsRes.json() : [];
    if (!settings.length || !settings[0].auto_bet_enabled) {
      return json({ data: { bets_placed: 0, message: "Auto-bet is disabled" } });
    }

    // -- Parse matches from request body --
    const body = await req.json().catch(() => ({}));
    const matches: AutoBetMatch[] = body.matches || [];
    if (matches.length === 0) {
      return json({ data: { bets_placed: 0, message: "No matches provided" } });
    }

    // -- Get user bankroll (column is current_amount, NOT balance) --
    const bankrollRes = await fetch(
      `${supabaseUrl}/rest/v1/user_bankroll?user_id=eq.${userId}&select=current_amount`,
      { headers: svcHdrs }
    );
    const bankrollData = bankrollRes.ok ? await bankrollRes.json() : [];
    const bankroll = bankrollData.length > 0
      ? parseFloat(bankrollData[0].current_amount) || 0
      : 0;

    if (bankroll <= 0) {
      return json({ data: { bets_placed: 0, message: "Insufficient bankroll" } });
    }

    // -- Check for existing bets today to prevent duplicates --
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
    const existingBetsRes = await fetch(
      `${supabaseUrl}/rest/v1/bets?user_id=eq.${userId}&race_date=eq.${today}&select=race_id,horse_id`,
      { headers: svcHdrs }
    );
    const existingBets: { race_id: string; horse_id: string }[] =
      existingBetsRes.ok ? await existingBetsRes.json() : [];
    const alreadyBet = new Set(existingBets.map(b => `${b.race_id}:${b.horse_id}`));

    console.log(`Auto-bet: ${matches.length} candidates, bankroll=GBP${bankroll.toFixed(2)}, existing=${alreadyBet.size}`);

    // -- Place bets --
    const betsPlaced: PlacedBet[] = [];
    let remainingBankroll = bankroll;

    for (const match of matches) {
      // Trust gate: only Strong picks (trust >= 70)
      const trustScore = match.trust_score || 0;
      if (trustScore < 70) continue;

      // Skip if already bet on this horse in this race
      const betKey = `${match.race_id}:${match.horse_id}`;
      if (alreadyBet.has(betKey)) {
        console.log(`Skip duplicate: ${match.horse_name} (${betKey})`);
        continue;
      }

      const ensProba = parseFloat(String(match.ensemble_proba)) || 0;
      const odds = parseFloat(String(match.opening_odds || match.current_odds)) || 0;

      if (ensProba < 0.15 || odds <= 1) continue;

      // Edge calculation
      const impliedProb = 1 / odds;
      const edge = ensProba - impliedProb;
      if (edge < 0.01) continue;

      // Kelly criterion with trust multiplier
      const kellyFull = edge / (odds - 1);
      const baseQuarterKelly = kellyFull / 4;

      let kellyMultiplier = 0.25;
      if (trustScore >= 80) kellyMultiplier = 1.5;
      else if (trustScore >= 60) kellyMultiplier = 1.0;
      else if (trustScore >= 30) kellyMultiplier = 0.5;

      const fraction = Math.min(baseQuarterKelly * kellyMultiplier, 0.05);
      let stake = Math.round(remainingBankroll * fraction * 2) / 2; // nearest 50p

      if (stake < 1) continue;
      if (stake > remainingBankroll) continue;

      // Place bet via place-bet edge function (uses user's JWT for auth)
      const betData = {
        horse_name: match.horse_name,
        horse_id: match.horse_id,
        race_id: match.race_id,
        course: match.course,
        off_time: match.off_time,
        trainer_name: match.trainer || "",
        jockey_name: match.jockey || "",
        current_odds: odds,
        bet_amount: stake,
        odds: odds,
      };

      const betRes = await fetch(`${supabaseUrl}/functions/v1/place-bet`, {
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
        alreadyBet.add(betKey);

        betsPlaced.push({
          horse_name: match.horse_name,
          race_id: match.race_id,
          horse_id: match.horse_id,
          stake,
          odds,
          trust_score: trustScore,
          kelly_multiplier: kellyMultiplier,
        });

        console.log(
          `Auto-bet placed: ${match.horse_name} @ ${odds} - GBP${stake} (trust=${trustScore}, mult=${kellyMultiplier}x)`
        );
      } else {
        const errText = await betRes.text().catch(() => "unknown");
        console.error(`Failed to place bet for ${match.horse_name}: ${betRes.status} ${errText}`);
      }
    }

    const totalStaked = betsPlaced.reduce((s, b) => s + b.stake, 0);

    return json({
      data: {
        bets_placed: betsPlaced.length,
        total_staked: totalStaked,
        remaining_bankroll: remainingBankroll,
        bets: betsPlaced,
      },
    });
  } catch (err) {
    console.error("mastermind-auto-bet error:", err);
    return json({ error: String(err) }, 500);
  }
});

// -- Types --

interface AutoBetMatch {
  horse_name: string;
  horse_id: string;
  race_id: string;
  course: string;
  off_time: string;
  trainer?: string;
  jockey?: string;
  ensemble_proba: number;
  opening_odds: number;
  current_odds: number;
  trust_score: number;
  trust_tier: string;
  pattern_count: number;
}

interface PlacedBet {
  horse_name: string;
  race_id: string;
  horse_id: string;
  stake: number;
  odds: number;
  trust_score: number;
  kelly_multiplier: number;
}
