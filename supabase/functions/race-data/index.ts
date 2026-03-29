/**
 * race-data — Returns race data for a specific date or single race.
 * Filters abandoned races from DB flags AND does a live check against
 * the Racing API to catch any newly-abandoned meetings.
 *
 * Market movement is computed from race_entries.opening_odds vs current_odds.
 * opening_odds is set on first push and protected by a DB trigger.
 * current_odds is updated throughout the day by update_live_odds.py.
 */

import { getCorsHeaders, handleCorsPreFlight } from '../_shared/cors.ts'

const API_USER = Deno.env.get('RACING_API_USERNAME')!;
const API_PASS = Deno.env.get('RACING_API_PASSWORD')!;

function computeOddsMovement(openingOdds: number, currentOdds: number) {
  if (!openingOdds || openingOdds <= 0 || !currentOdds || currentOdds <= 0) {
    return { odds_movement: null, odds_movement_pct: null };
  }
  const pctChange = ((currentOdds - openingOdds) / openingOdds) * 100;
  let odds_movement: 'steaming' | 'drifting' | 'stable' | null = null;
  if (currentOdds < openingOdds * 0.85) odds_movement = 'steaming';
  else if (currentOdds > openingOdds * 1.15) odds_movement = 'drifting';
  else odds_movement = 'stable';
  return { odds_movement, odds_movement_pct: Math.round(Math.abs(pctChange) * 10) / 10 };
}

async function getApiAbandonedRaceIds(
  supabaseUrl: string, restHeaders: Record<string, string>
): Promise<Set<string>> {
  const result = new Set<string>();
  try {
    const apiAuth = btoa(`${API_USER}:${API_PASS}`);
    const rcRes = await fetch('https://api.theracingapi.com/v1/racecards/pro', {
      headers: { Authorization: `Basic ${apiAuth}`, 'Content-Type': 'application/json' }
    });
    if (!rcRes.ok) return result;
    const rc = await rcRes.json().catch(() => ({}));
    const racecards = Array.isArray(rc?.racecards) ? rc.racecards : [];

    const abandonedIds: string[] = [];
    for (const race of racecards) {
      const raceId = String(race?.race_id ?? '');
      if (!raceId) continue;
      const isAbandoned =
        race?.is_abandoned === true ||
        race?.race_status === 'abandoned' ||
        String(race?.going ?? '').toLowerCase() === 'abandoned';
      if (isAbandoned) {
        result.add(raceId);
        abandonedIds.push(raceId);
      }
    }

    if (abandonedIds.length > 0) {
      const BATCH = 50;
      for (let i = 0; i < abandonedIds.length; i += BATCH) {
        const batch = abandonedIds.slice(i, i + BATCH);
        const idsParam = batch.map(id => `"${id}"`).join(',');
        fetch(
          `${supabaseUrl}/rest/v1/races?race_id=in.(${idsParam})`,
          {
            method: 'PATCH',
            headers: { ...restHeaders, 'Prefer': 'return=minimal' },
            body: JSON.stringify({ is_abandoned: true, race_status: 'abandoned' })
          }
        ).catch(() => {});
      }
    }
  } catch {
    console.error('race-data: abandonment API check failed');
  }
  return result;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  const preflight = handleCorsPreFlight(req)
  if (preflight) return preflight

  try {
    const u = Deno.env.get('SUPABASE_URL')!;
    const k = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    if (!u || !k) throw new Error('Config missing');

    const restHeaders = {
      'Authorization': `Bearer ${k}`,
      'apikey': k,
      'Content-Type': 'application/json'
    };

    const url = new URL(req.url);
    const raceId = url.searchParams.get('raceId');

    // ─── SINGLE RACE MODE ───
    if (raceId) {
      const raceRes = await fetch(
        `${u}/rest/v1/races?race_id=eq.${raceId}&select=*`,
        { headers: restHeaders }
      );
      if (!raceRes.ok) throw new Error(`Failed to fetch race: ${raceRes.status}`);
      const races = await raceRes.json();
      const race = races[0];
      if (!race) {
        return new Response(JSON.stringify({
          data: { race: null, entries: [] }
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const entriesRes = await fetch(
        `${u}/rest/v1/race_entries?race_id=eq.${raceId}&select=*&order=ensemble_proba.desc.nullslast`,
        { headers: restHeaders }
      );
      const entries = entriesRes.ok ? await entriesRes.json() : [];

      for (const entry of entries) {
        const open = Number(entry.opening_odds) || 0;
        const cur = Number(entry.current_odds) || 0;
        const mv = computeOddsMovement(open, cur);
        entry.odds_movement = mv.odds_movement;
        entry.odds_movement_pct = mv.odds_movement_pct;
      }

      const resultsRes = await fetch(
        `${u}/rest/v1/race_results?race_id=eq.${raceId}&select=race_id`,
        { headers: restHeaders }
      );
      const resultsData = resultsRes.ok ? await resultsRes.json() : [];
      const hasResults = resultsData.length > 0;

      let runners: any[] = [];
      if (hasResults) {
        const runnersRes = await fetch(
          `${u}/rest/v1/race_runners?race_id=eq.${raceId}&select=*&order=position.asc.nullslast`,
          { headers: restHeaders }
        );
        runners = runnersRes.ok ? await runnersRes.json() : [];
      }

      return new Response(JSON.stringify({
        data: {
          race: { ...race, hasResults, runners },
          entries,
          topEntries: entries
        }
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ─── ALL RACES FOR DATE MODE ───
    const body = await req.json().catch(() => ({}));
    let date = body.date;
    if (!date) {
      const now = new Date();
      date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(now);
    }

    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
    const isToday = date === todayStr;

    const dbFetchPromise = fetch(
      `${u}/rest/v1/races?date=eq.${date}&order=off_time.asc&select=*`,
      { headers: restHeaders }
    );
    const apiCheckPromise = isToday
      ? getApiAbandonedRaceIds(u, restHeaders)
      : Promise.resolve(new Set<string>());

    const [racesRes, apiAbandonedSet] = await Promise.all([dbFetchPromise, apiCheckPromise]);

    if (!racesRes.ok) throw new Error(`Failed to fetch races: ${racesRes.status}`);
    const allRaces = await racesRes.json();

    if (allRaces.length === 0) {
      return new Response(JSON.stringify({
        data: { races: [], date, total_races: 0, completed_races: 0, abandoned_courses: [], abandoned_count: 0 }
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const abandonedRaceIds = new Set(
      allRaces.filter((r: any) =>
        r.going?.toLowerCase() === 'abandoned' ||
        r.is_abandoned === true ||
        r.race_status === 'abandoned' ||
        apiAbandonedSet.has(r.race_id)
      ).map((r: any) => r.race_id)
    );
    const abandonedCourses = [...new Set(
      allRaces.filter((r: any) => abandonedRaceIds.has(r.race_id)).map((r: any) => r.course_name)
    )];
    const races = allRaces.filter((r: any) => !abandonedRaceIds.has(r.race_id));

    const raceIds = races.map((r: any) => r.race_id);
    const batchSize = 30;

    let allEntries: any[] = [];
    for (let i = 0; i < raceIds.length; i += batchSize) {
      const batch = raceIds.slice(i, i + batchSize);
      const idsParam = batch.map((id: string) => `"${id}"`).join(',');
      const entriesRes = await fetch(
        `${u}/rest/v1/race_entries?race_id=in.(${idsParam})&select=*&order=ensemble_proba.desc.nullslast`,
        { headers: restHeaders }
      );
      if (entriesRes.ok) {
        allEntries = allEntries.concat(await entriesRes.json());
      }
    }

    // Compute market movement from opening_odds vs current_odds directly
    for (const entry of allEntries) {
      const open = Number(entry.opening_odds) || 0;
      const cur = Number(entry.current_odds) || 0;
      const mv = computeOddsMovement(open, cur);
      entry.odds_movement = mv.odds_movement;
      entry.odds_movement_pct = mv.odds_movement_pct;
    }

    // Check which races have results
    const racesWithResults = new Set<string>();
    for (let i = 0; i < raceIds.length; i += batchSize) {
      const batch = raceIds.slice(i, i + batchSize);
      const idsParam = batch.map((id: string) => `"${id}"`).join(',');
      const resultsRes = await fetch(
        `${u}/rest/v1/race_results?race_id=in.(${idsParam})&select=race_id`,
        { headers: restHeaders }
      );
      if (resultsRes.ok) {
        const data = await resultsRes.json();
        for (const r of data) racesWithResults.add(r.race_id);
      }
    }

    const completedRaceIds = raceIds.filter((id: string) => racesWithResults.has(id));
    let allRunners: any[] = [];
    for (let i = 0; i < completedRaceIds.length; i += batchSize) {
      const batch = completedRaceIds.slice(i, i + batchSize);
      const idsParam = batch.map((id: string) => `"${id}"`).join(',');
      const runnersRes = await fetch(
        `${u}/rest/v1/race_runners?race_id=in.(${idsParam})&select=*&order=position.asc.nullslast`,
        { headers: restHeaders }
      );
      if (runnersRes.ok) {
        allRunners = allRunners.concat(await runnersRes.json());
      }
    }

    const runnersByRace = new Map<string, any[]>();
    for (const runner of allRunners) {
      if (!runnersByRace.has(runner.race_id)) runnersByRace.set(runner.race_id, []);
      runnersByRace.get(runner.race_id)!.push(runner);
    }

    const entriesByRace = new Map<string, any[]>();
    for (const entry of allEntries) {
      if (!entriesByRace.has(entry.race_id)) entriesByRace.set(entry.race_id, []);
      entriesByRace.get(entry.race_id)!.push(entry);
    }

    const enrichedRaces = races.map((race: any) => {
      const entries = entriesByRace.get(race.race_id) || [];
      entries.sort((a: any, b: any) => (b.ensemble_proba || 0) - (a.ensemble_proba || 0));
      const hasResults = racesWithResults.has(race.race_id);
      const runners = runnersByRace.get(race.race_id) || [];
      return {
        ...race,
        topEntries: entries,
        totalEntries: entries.length,
        hasResults,
        runners: hasResults ? runners : []
      };
    });

    return new Response(JSON.stringify({
      data: {
        races: enrichedRaces,
        date,
        total_races: enrichedRaces.length,
        completed_races: completedRaceIds.length,
        abandoned_courses: abandonedCourses,
        abandoned_count: abandonedRaceIds.size
      }
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('race-data failed');
    return new Response(JSON.stringify({
      error: { code: 'RACE_DATA_ERROR', message: error.message }
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
