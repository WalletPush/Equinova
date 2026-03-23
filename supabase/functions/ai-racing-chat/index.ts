Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Credentials': 'false',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');

    if (!serviceRoleKey || !supabaseUrl) {
      throw new Error('Supabase configuration missing');
    }
    if (!anthropicKey) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new Error('No authorization header provided');
    }
    const token = authHeader.replace('Bearer ', '');
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': serviceRoleKey,
      },
    });
    if (!userResponse.ok) {
      throw new Error('Invalid authentication');
    }

    const { message, history = [], context = {} } = await req.json();

    if (!message || typeof message !== 'string') {
      throw new Error('Message is required');
    }

    // ── Fetch race data from Supabase ──────────────────────────────
    let dataBriefing = '';

    if (context.race_id) {
      const headers = {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
        'Content-Type': 'application/json',
      };

      // Fetch race metadata
      const raceRes = await fetch(
        `${supabaseUrl}/rest/v1/races?race_id=eq.${context.race_id}&select=course_name,date,off_time,distance,race_class,type,age_band,going,surface,field_size,prize`,
        { headers }
      );
      const races = await raceRes.json();
      const race = races?.[0];

      // Fetch ALL entries in this race
      const entriesRes = await fetch(
        `${supabaseUrl}/rest/v1/race_entries?race_id=eq.${context.race_id}&select=horse_name,horse_id,jockey_name,trainer_name,age,sex,lbs,ofr,rpr,ts,current_odds,opening_odds,number,draw,form,last_run,comment,spotlight,mean_speed_figure,last_speed_figure,best_speed_figure_at_distance,best_speed_figure_at_track,avg_finishing_position,avg_ovr_btn,avg_finishing_position_going,jockey_win_percentage_at_distance,trainer_win_percentage_at_distance,trainer_win_percentage_at_course,horse_win_percentage_at_distance,trainer_21_days_win_percentage,jockey_21_days_win_percentage,trainer_avg_finishing_position_at_course,horse_ae_at_distance,ensemble_proba,stage1_proba,benter_proba,rf_proba,xgboost_proba,edge,kelly_fraction,predicted_winner,bet_tier&order=ensemble_proba.desc.nullslast`,
        { headers }
      );
      const entries = await entriesRes.json();

      if (race && entries?.length) {
        const lines: string[] = [];
        lines.push('=== RACE DATA ===');
        lines.push(`Course: ${race.course_name} | Date: ${race.date} | Off: ${race.off_time}`);
        lines.push(`Distance: ${race.distance} | Class: ${race.race_class} | Type: ${race.type} | Going: ${race.going}`);
        lines.push(`Field size: ${race.field_size} | Age: ${race.age_band} | Prize: ${race.prize}`);
        lines.push('');

        for (const e of entries) {
          const isTarget = e.horse_name?.toLowerCase() === context.horse_name?.toLowerCase();
          const marker = isTarget ? ' ★ TOP PICK' : '';
          lines.push(`--- ${e.horse_name}${marker} ---`);
          lines.push(`  #${e.number || '?'} | Draw: ${e.draw ?? '-'} | Age: ${e.age}${e.sex || ''} | Weight: ${e.lbs || '-'}lbs`);
          lines.push(`  Jockey: ${e.jockey_name || '-'} | Trainer: ${e.trainer_name || '-'}`);
          lines.push(`  Form: ${e.form || '-'} | Last run: ${e.last_run ?? '-'} days ago`);
          lines.push(`  Odds: ${e.current_odds ?? '-'} (opening: ${e.opening_odds ?? '-'}) | RPR: ${e.rpr ?? '-'} | OFR: ${e.ofr ?? '-'} | TS: ${e.ts ?? '-'}`);

          const sp = (v: number | null | undefined) => v != null ? v.toFixed(1) : '-';
          const pct = (v: number | null | undefined) => v != null ? (v * 100).toFixed(1) + '%' : '-';
          const pctRaw = (v: number | null | undefined) => v != null ? v.toFixed(1) + '%' : '-';

          lines.push(`  Speed: mean=${sp(e.mean_speed_figure)} last=${sp(e.last_speed_figure)} best@dist=${sp(e.best_speed_figure_at_distance)} best@track=${sp(e.best_speed_figure_at_track)}`);
          lines.push(`  Avg finish pos: ${sp(e.avg_finishing_position)} | Avg beaten: ${sp(e.avg_ovr_btn)} | Going finish: ${sp(e.avg_finishing_position_going)}`);
          lines.push(`  Horse dist win%: ${pct(e.horse_win_percentage_at_distance)} | Horse A/E@dist: ${sp(e.horse_ae_at_distance)}`);
          lines.push(`  Jockey dist win%: ${pct(e.jockey_win_percentage_at_distance)} | Jockey 21d: ${pctRaw(e.jockey_21_days_win_percentage)}`);
          lines.push(`  Trainer dist win%: ${pct(e.trainer_win_percentage_at_distance)} | Trainer course win%: ${pct(e.trainer_win_percentage_at_course)} | Trainer 21d: ${pctRaw(e.trainer_21_days_win_percentage)}`);
          lines.push(`  EquiNOVA: prob=${pct(e.ensemble_proba)} edge=${e.edge != null ? (e.edge > 0 ? '+' : '') + (e.edge * 100).toFixed(1) + '%' : '-'} | Kelly=${sp(e.kelly_fraction)} | Tier: ${e.bet_tier || '-'}`);
          lines.push(`  Models: LGBM=${pct(e.benter_proba)} RF=${pct(e.rf_proba)} XGB=${pct(e.xgboost_proba)}`);

          if (isTarget) {
            if (e.spotlight) lines.push(`  Spotlight: ${e.spotlight}`);
            if (e.comment) lines.push(`  Comment: ${e.comment}`);
          }
          lines.push('');
        }

        dataBriefing = lines.join('\n');
      }
    }

    // ── Build system prompt ────────────────────────────────────────
    const systemParts: string[] = [
      "You are EquiNOVA's racing analyst — concise, data-driven, and confident.",
      'You have full race data below including every runner, their form, speed figures, jockey/trainer stats, and EquiNOVA model probabilities.',
      'Give short, punchy analysis backed by the data provided. Keep responses under 250 words.',
      'Format key stats in bold. Use bullet points for clarity.',
      'Never give explicit betting advice — present facts and let the user decide.',
      'When comparing rivals, reference the data for each runner shown below.',
    ];

    if (context.horse_name) {
      systemParts.push('');
      systemParts.push(`The user is viewing Top Pick: ${context.horse_name}`);
    }

    if (dataBriefing) {
      systemParts.push('');
      systemParts.push(dataBriefing);
    }

    const systemPrompt = systemParts.join('\n');

    const trimmedHistory = history.slice(-10);
    const messages = [
      ...trimmedHistory.map((h: { role: string; content: string }) => ({
        role: h.role,
        content: h.content,
      })),
      { role: 'user', content: message },
    ];

    console.log(`AI Chat - Calling Anthropic (${messages.length} msgs, prompt ~${systemPrompt.length} chars, horse: ${context.horse_name || 'none'})`);

    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1024,
        system: systemPrompt,
        messages,
      }),
    });

    if (!anthropicResponse.ok) {
      const errText = await anthropicResponse.text();
      throw new Error(`AI service error (${anthropicResponse.status}): ${errText}`);
    }

    const result = await anthropicResponse.json();

    const textBlocks = (result.content || [])
      .filter((block: { type: string }) => block.type === 'text')
      .map((block: { text: string }) => block.text);

    const responseText = textBlocks.join('\n\n') || 'No response generated.';

    const usage = result.usage || {};
    console.log(`AI Chat - Response (input: ${usage.input_tokens}, output: ${usage.output_tokens})`);

    return new Response(JSON.stringify({
      success: true,
      data: {
        response: responseText,
        usage: {
          input_tokens: usage.input_tokens || 0,
          output_tokens: usage.output_tokens || 0,
        },
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('AI Racing Chat error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: {
        code: 'AI_RACING_CHAT_ERROR',
        message: error.message,
      },
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
