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
    const racingApiToken = Deno.env.get('RACING_API_OAUTH_TOKEN');

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
      'You are EquiNOVA\'s racing analyst — concise, data-driven, and confident.',
      'Use the Racing API tools to look up form, jockey/trainer statistics, course/distance records, going preferences, and any other relevant data.',
      'Give short, punchy analysis backed by the data you retrieve. Keep responses under 300 words.',
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

    // Build messages array: system + history + current message
    // Truncate history to last 10 messages to control token cost
    const trimmedHistory = history.slice(-10);
    const messages = [
      ...trimmedHistory.map((h: { role: string; content: string }) => ({
        role: h.role,
        content: h.content,
      })),
      { role: 'user', content: message },
    ];

    console.log(`AI Chat - Calling Anthropic (${messages.length} messages, context: ${context.horse_name || 'none'})`);

    // Call Anthropic Messages API with MCP connector
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'mcp-client-2025-11-20',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6-20250929',
        max_tokens: 1024,
        system: systemPrompt,
        messages,
        mcp_servers: [
          {
            type: 'url',
            url: 'https://mcp.theracingapi.com/',
            name: 'the-racing-api',
            authorization_token: racingApiToken,
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

    if (!anthropicResponse.ok) {
      const errBody = await anthropicResponse.text();
      console.error('Anthropic API error:', anthropicResponse.status, errBody);
      throw new Error(`AI service error (${anthropicResponse.status}): ${errBody}`);
    }

    const result = await anthropicResponse.json();

    // Extract text blocks from the response (skip tool use/result blocks)
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
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
