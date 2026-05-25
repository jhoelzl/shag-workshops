import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEFAULT_ALLOWED_ORIGINS = [
  'https://shagadeus.at',
  'http://localhost:4321',
  'https://localhost:4321',
];

const allowedOrigins = new Set(
  (Deno.env.get('ALLOWED_ORIGINS') ?? Deno.env.get('ALLOWED_ORIGIN') ?? DEFAULT_ALLOWED_ORIGINS.join(','))
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean)
);

function isAllowedOrigin(originHeader: string | null): boolean {
  if (!originHeader) return true;
  try {
    return allowedOrigins.has(new URL(originHeader).origin.replace(/\/$/, ''));
  } catch {
    return false;
  }
}

const TABLES = [
  'dance_classes',
  'class_sessions',
  'registrations',
  'registration_history',
] as const;

Deno.serve(async (req) => {
  if (!isAllowedOrigin(req.headers.get('origin'))) {
    return new Response(
      JSON.stringify({ error: 'Forbidden origin', code: 'FORBIDDEN_ORIGIN' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const tables: Record<string, unknown[]> = {};

    for (const table of TABLES) {
      const { data, error } = await supabase
        .from(table)
        .select('*');

      if (error) {
        console.error(`Backup failed on table ${table}:`, error);
        return new Response(
          JSON.stringify({ error: `Backup failed while exporting table ${table}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      tables[table] = data ?? [];
    }

    const backup = {
      exported_at: new Date().toISOString(),
      exported_by: user.id,
      schema: 'public',
      tables,
    };

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `shag-workshops-backup-${timestamp}.json`;

    return new Response(JSON.stringify(backup, null, 2), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error('Unexpected backup error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
