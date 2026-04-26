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
    const { dance_class_id, role, name, email, partner_name, comment, locale } = await req.json();

    // Input validation
    if (!dance_class_id || !role || !name || !email) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields', code: 'VALIDATION' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!['lead', 'follow'].includes(role)) {
      return new Response(
        JSON.stringify({ error: 'Invalid role', code: 'VALIDATION' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email', code: 'VALIDATION' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with service role key (bypasses RLS)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Check if class exists and is open
    const { data: danceClass, error: classError } = await supabase
      .from('dance_classes')
      .select('*')
      .eq('id', dance_class_id)
      .single();

    if (classError || !danceClass) {
      return new Response(
        JSON.stringify({ error: 'Dance class not found', code: 'NOT_FOUND' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const now = new Date();

    // Registration opens at a specific time if configured.
    if (danceClass.registration_opens_at && new Date(danceClass.registration_opens_at) > now) {
      return new Response(
        JSON.stringify({ error: 'Registration is closed', code: 'CLOSED' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (danceClass.registration_closes_at && new Date(danceClass.registration_closes_at) < now) {
      return new Response(
        JSON.stringify({ error: 'Registration deadline has passed', code: 'CLOSED' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for duplicate
    const { data: existing } = await supabase
      .from('registrations')
      .select('id')
      .eq('dance_class_id', dance_class_id)
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ error: 'Already registered', code: 'DUPLICATE' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check capacity
    const { data: counts } = await supabase
      .from('class_registration_counts')
      .select('*')
      .eq('dance_class_id', dance_class_id)
      .single();

    const roleField = role === 'lead' ? 'leads_available' : 'follows_available';
    const spotsAvailable = counts ? Number(counts[roleField]) : (role === 'lead' ? danceClass.max_leads : danceClass.max_follows);
    const status = spotsAvailable > 0 ? 'pending' : 'waitlisted';

    // Insert registration
    const { data: registration, error: insertError } = await supabase
      .from('registrations')
      .insert({
        dance_class_id,
        email: email.toLowerCase().trim(),
        name: name.trim(),
        role,
        partner_name: partner_name?.trim() || null,
        comment: comment?.trim() || null,
        status,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      return new Response(
        JSON.stringify({ error: 'Registration failed', code: 'INSERT_ERROR' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send confirmation email via Resend
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) {
      console.warn('RESEND_API_KEY is not set — skipping email send');
    }
    if (resendKey) {
      const resend = new Resend(resendKey);
      const isDE = locale === 'de';
      const classTitle = isDE ? danceClass.title_de : danceClass.title_en;
      const fromAddress = Deno.env.get('EMAIL_FROM') || 'Collegiate Shag Salzburg <onboarding@resend.dev>';
      const overrideTo = Deno.env.get('EMAIL_TO_OVERRIDE');
      const realTo = email.toLowerCase().trim();
      const toAddress = overrideTo || realTo;
      if (overrideTo) {
        console.log(`EMAIL_TO_OVERRIDE active — redirecting mail for ${realTo} to ${overrideTo}`);
      }

      try {
        const { data: sendData, error: sendError } = await resend.emails.send({
          from: fromAddress,
          to: [toAddress],
          subject: isDE
            ? `Anmeldung eingegangen: ${classTitle}`
            : `Registration received: ${classTitle}`,
          html: isDE
            ? `<h2>Hallo ${name.trim()}!</h2>
               <p>Deine Anmeldung für <strong>${classTitle}</strong> als <strong>${role === 'lead' ? 'Lead' : 'Follow'}</strong> ist eingegangen.</p>
               ${status === 'waitlisted' ? '<p>⚠️ Aktuell sind alle Plätze belegt. Du stehst auf der Warteliste.</p>' : ''}
               <p>Wir werden deine Anmeldung prüfen und bestätigen. Du erhältst dann eine weitere E-Mail.</p>
               <p>Collegiate Shag Salzburg 💃</p>`
            : `<h2>Hello ${name.trim()}!</h2>
               <p>Your registration for <strong>${classTitle}</strong> as <strong>${role === 'lead' ? 'Lead' : 'Follow'}</strong> has been received.</p>
               ${status === 'waitlisted' ? '<p>⚠️ All spots are currently taken. You have been placed on the waitlist.</p>' : ''}
               <p>The organizer will review and confirm your registration. You will receive another email then.</p>
               <p>Collegiate Shag Salzburg 💃</p>`,
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
      JSON.stringify({ success: true, status, id: registration.id }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Unexpected error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error', code: 'SERVER_ERROR' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
