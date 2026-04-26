import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'https://esm.sh/resend@4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify admin auth
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

    const { registration_id, new_status } = await req.json();

    if (!registration_id || !new_status) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!['confirmed', 'waitlisted', 'cancelled'].includes(new_status)) {
      return new Response(
        JSON.stringify({ error: 'Invalid status' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use service role to update
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get registration with class info
    const { data: registration, error: regError } = await supabase
      .from('registrations')
      .select('*, dance_classes(*)')
      .eq('id', registration_id)
      .single();

    if (regError || !registration) {
      return new Response(
        JSON.stringify({ error: 'Registration not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update status
    const { error: updateError } = await supabase
      .from('registrations')
      .update({ status: new_status })
      .eq('id', registration_id);

    if (updateError) {
      return new Response(
        JSON.stringify({ error: 'Update failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send email notification
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (resendKey) {
      const resend = new Resend(resendKey);
      const dc = registration.dance_classes;

      const subjects: Record<string, { de: string; en: string }> = {
        confirmed: {
          de: `Bestätigt: ${dc.title_de}`,
          en: `Confirmed: ${dc.title_en}`,
        },
        waitlisted: {
          de: `Warteliste: ${dc.title_de}`,
          en: `Waitlisted: ${dc.title_en}`,
        },
        cancelled: {
          de: `Abgesagt: ${dc.title_de}`,
          en: `Cancelled: ${dc.title_en}`,
        },
      };

      const bodies: Record<string, { de: string; en: string }> = {
        confirmed: {
          de: `<h2>Hallo ${registration.name}!</h2>
               <p>Deine Anmeldung für <strong>${dc.title_de}</strong> wurde <strong>bestätigt</strong>! 🎉</p>
               <p>Wir freuen uns auf dich!</p>
               <p>Collegiate Shag Salzburg 💃</p>`,
          en: `<h2>Hello ${registration.name}!</h2>
               <p>Your registration for <strong>${dc.title_en}</strong> has been <strong>confirmed</strong>! 🎉</p>
               <p>We look forward to seeing you!</p>
               <p>Collegiate Shag Salzburg 💃</p>`,
        },
        waitlisted: {
          de: `<h2>Hallo ${registration.name}!</h2>
               <p>Du stehst jetzt auf der <strong>Warteliste</strong> für <strong>${dc.title_de}</strong>.</p>
               <p>Wir melden uns, sobald ein Platz frei wird.</p>
               <p>Collegiate Shag Salzburg 💃</p>`,
          en: `<h2>Hello ${registration.name}!</h2>
               <p>You have been placed on the <strong>waitlist</strong> for <strong>${dc.title_en}</strong>.</p>
               <p>We will notify you when a spot becomes available.</p>
               <p>Collegiate Shag Salzburg 💃</p>`,
        },
        cancelled: {
          de: `<h2>Hallo ${registration.name}!</h2>
               <p>Leider wurde deine Anmeldung für <strong>${dc.title_de}</strong> <strong>abgesagt</strong>.</p>
               <p>Bei Fragen kontaktiere uns gerne.</p>
               <p>Collegiate Shag Salzburg 💃</p>`,
          en: `<h2>Hello ${registration.name}!</h2>
               <p>Unfortunately your registration for <strong>${dc.title_en}</strong> has been <strong>cancelled</strong>.</p>
               <p>Please contact us if you have any questions.</p>
               <p>Collegiate Shag Salzburg 💃</p>`,
        },
      };

      // Default to German if we don't know the locale
      const lang = 'de';
      const fromAddress = Deno.env.get('EMAIL_FROM') || 'Collegiate Shag Salzburg <onboarding@resend.dev>';
      const overrideTo = Deno.env.get('EMAIL_TO_OVERRIDE');
      const toAddress = overrideTo || registration.email;
      if (overrideTo) {
        console.log(`EMAIL_TO_OVERRIDE active — redirecting mail for ${registration.email} to ${overrideTo}`);
      }

      try {
        const { data: sendData, error: sendError } = await resend.emails.send({
          from: fromAddress,
          to: [toAddress],
          subject: subjects[new_status][lang],
          html: bodies[new_status][lang],
        });
        if (sendError) {
          console.error('Resend send error:', JSON.stringify(sendError), 'from:', fromAddress, 'to:', toAddress);
        } else {
          console.log('Resend send ok:', JSON.stringify(sendData), 'to:', toAddress);
        }
      } catch (e) {
        console.error('Resend send threw:', e instanceof Error ? e.message : String(e), 'from:', fromAddress, 'to:', toAddress);
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Unexpected error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
