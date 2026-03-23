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
    let racingApiToken = Deno.env.get('RACING_API_OAUTH_TOKEN');
    const refreshToken = Deno.env.get('RACING_API_REFRESH_TOKEN');
    const clientId = Deno.env.get('RACING_API_CLIENT_ID');
    const clientSecret = Deno.env.get('RACING_API_CLIENT_SECRET');

    if (!serviceRoleKey || !supabaseUrl) {
      throw new Error('Supabase configuration missing');
    }
    if (!anthropicKey) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }
    if (!racingApiToken) {
      throw new Error('RACING_API_OAUTH_TOKEN not configured');
    }

    // Authenticate user
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
    const userData = await userResponse.json();
    console.log('AI Chat - User authenticated:', userData.id);

    const { message, history = [], context = {} } = await req.json();

    if (!message || typeof message !== 'string') {
      throw new Error('Message is required');
    }

    // Build system prompt with EquiNOVA context
    const contextLines: string[] = [
      "You are EquiNOVA's racing analyst — concise, data-driven, and confident.",
      'Use the Racing API tools to look up data. IMPORTANT: use at most 2-3 tool calls per response to stay fast. Focus on the single most relevant data source.',
      'Give short, punchy analysis backed by the data you retrieve. Keep responses under 200 words.',
      'Format key stats in bold. Use bullet points for clarity.',
      'Never give explicit betting advice — present facts and let the user decide.',
    ];

    if (context.horse_name) {
      contextLines.push('');
      contextLines.push(`The user is viewing a Top Pick: **${context.horse_name}**`);
      if (context.course) contextLines.push(`Course: ${context.course}`);
      if (context.off_time) contextLines.push(`Off time: ${context.off_time}`);
      if (context.race_type) contextLines.push(`Race type: ${context.race_type}`);
      if (context.ensemble_proba != null) {
        const benterPct = (context.ensemble_proba * 100).toFixed(1);
        contextLines.push(`EquiNOVA Benter model probability: ${benterPct}%`);
      }
      if (context.implied_prob != null) {
        const marketPct = (context.implied_prob * 100).toFixed(1);
        contextLines.push(`Market implied probability: ${marketPct}%`);
      }
      if (context.edge != null) {
        const edgePct = (context.edge * 100).toFixed(1);
        contextLines.push(`Edge: +${edgePct}%`);
      }
      if (context.current_odds != null) {
        contextLines.push(`Current odds: ${context.current_odds}`);
      }
      if (context.jockey) contextLines.push(`Jockey: ${context.jockey}`);
      if (context.trainer) contextLines.push(`Trainer: ${context.trainer}`);
    }

    const systemPrompt = contextLines.join('\n');

    const trimmedHistory = history.slice(-10);
    const messages = [
      ...trimmedHistory.map((h: { role: string; content: string }) => ({
        role: h.role,
        content: h.content,
      })),
      { role: 'user', content: message },
    ];

    console.log(`AI Chat - Calling Anthropic (${messages.length} messages, context: ${context.horse_name || 'none'})`);

    // Try calling Anthropic with current token; if auth fails, refresh and retry once
    async function callAnthropic(accessToken: string) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);
      try {
      return await fetch('https://api.anthropic.com/v1/messages', {
        signal: controller.signal,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': anthropicKey!,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'mcp-client-2025-11-20',
        },
        body: JSON.stringify({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 1024,
          system: systemPrompt,
          messages,
          mcp_servers: [
            {
              type: 'url',
              url: 'https://mcp.theracingapi.com/',
              name: 'the-racing-api',
              authorization_token: accessToken,
            },
          ],
          tools: [
            {
              type: 'mcp_toolset',
              mcp_server_name: 'the-racing-api',
            },
          ],
        }),
      });
      } finally {
        clearTimeout(timeout);
      }
    }

    let anthropicResponse = await callAnthropic(racingApiToken!);

    // If MCP auth failed, try refreshing the token
    if (!anthropicResponse.ok) {
      const errText = await anthropicResponse.text();
      const isMcpAuthError = errText.includes('Authentication error while communicating with MCP server');

      if (isMcpAuthError && refreshToken && clientId && clientSecret) {
        console.log('AI Chat - Access token expired, refreshing...');
        const refreshResponse = await fetch('https://mcp.theracingapi.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: clientId,
            client_secret: clientSecret,
          }).toString(),
        });

        if (refreshResponse.ok) {
          const tokenData = await refreshResponse.json();
          racingApiToken = tokenData.access_token;
          console.log('AI Chat - Token refreshed successfully');

          // Retry with new token
          anthropicResponse = await callAnthropic(racingApiToken!);
          if (!anthropicResponse.ok) {
            const retryErr = await anthropicResponse.text();
            throw new Error(`AI service error after refresh (${anthropicResponse.status}): ${retryErr}`);
          }
        } else {
          const refreshErr = await refreshResponse.text();
          console.error('Token refresh failed:', refreshErr);
          throw new Error(`Token refresh failed. Original error: ${errText}`);
        }
      } else {
        throw new Error(`AI service error (${anthropicResponse.status}): ${errText}`);
      }
    }

    const result = await anthropicResponse.json();

    const textBlocks = (result.content || [])
      .filter((block: { type: string }) => block.type === 'text')
      .map((block: { text: string }) => block.text);

    const responseText = textBlocks.join('\n\n') || 'No response generated.';

    const usage = result.usage || {};
    console.log(`AI Chat - Response received (input: ${usage.input_tokens}, output: ${usage.output_tokens})`);

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
