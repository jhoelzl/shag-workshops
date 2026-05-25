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

const DELETE_ORDER = [
  'registration_history',
  'class_sessions',
  'registrations',
  'dance_classes',
] as const;

const INSERT_ORDER = [
  'dance_classes',
  'class_sessions',
  'registrations',
  'registration_history',
] as const;

type BackupPayload = {
  exported_at?: string;
  schema?: string;
  tables?: Record<string, unknown[]>;
};

function asRows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row) => row && typeof row === 'object') as Record<string, unknown>[];
}

async function insertInChunks(
  supabase: ReturnType<typeof createClient>,
  table: string,
  rows: Record<string, unknown>[]
): Promise<void> {
  const chunkSize = 500;
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    const { error } = await supabase.from(table).insert(chunk);
    if (error) throw new Error(`Insert failed for ${table}: ${error.message}`);
  }
}

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

    const body = await req.json().catch(() => ({}));
    const backup = (body?.backup ?? null) as BackupPayload | null;

    if (!backup || !backup.tables || typeof backup.tables !== 'object') {
      return new Response(
        JSON.stringify({ error: 'Invalid backup file format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (backup.schema && backup.schema !== 'public') {
      return new Response(
        JSON.stringify({ error: 'Only public schema backups are supported' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    for (const table of DELETE_ORDER) {
      const { error } = await supabase
        .from(table)
        .delete()
        .not('id', 'is', null);
      if (error) {
        throw new Error(`Delete failed for ${table}: ${error.message}`);
      }
    }

    let restoredRows = 0;
    const restoredTables: Record<string, number> = {};

    for (const table of INSERT_ORDER) {
      const rows = asRows(backup.tables[table]);
      if (rows.length === 0) {
        restoredTables[table] = 0;
        continue;
      }

      await insertInChunks(supabase, table, rows);
      restoredRows += rows.length;
      restoredTables[table] = rows.length;
    }

    return new Response(
      JSON.stringify({
        success: true,
        restored_rows: restoredRows,
        restored_tables: restoredTables,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Unexpected restore error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
