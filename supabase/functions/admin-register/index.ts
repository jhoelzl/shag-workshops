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

    const {
      dance_class_id,
      role,
      name,
      email,
      partner_name,
      comment,
      locale,
      send_email,
    } = await req.json();

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

    // Service role client (bypasses RLS, admin override)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const insertHistory = async (entry: Record<string, unknown>) => {
      const { error } = await supabase.from('registration_history').insert(entry);
      if (error) {
        console.error('History insert failed:', error);
      }
    };

    // Look up class
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

    // Duplicate check
    const normalizedEmail = email.toLowerCase().trim();
    const { data: existing } = await supabase
      .from('registrations')
      .select('id')
      .eq('dance_class_id', dance_class_id)
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ error: 'Already registered', code: 'DUPLICATE' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine status based on capacity (admin can later override)
    const { data: counts } = await supabase
      .from('class_registration_counts')
      .select('*')
      .eq('dance_class_id', dance_class_id)
      .single();

    const roleField = role === 'lead' ? 'leads_available' : 'follows_available';
    const spotsAvailable = counts
      ? Number(counts[roleField])
      : (role === 'lead' ? danceClass.max_leads : danceClass.max_follows);
    // Admin manual entry: confirm directly when spots available, otherwise waitlist
    const status = spotsAvailable > 0 ? 'confirmed' : 'waitlisted';

    const { data: registration, error: insertError } = await supabase
      .from('registrations')
      .insert({
        dance_class_id,
        email: normalizedEmail,
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

    await insertHistory({
      registration_id: registration.id,
      dance_class_id,
      event_type: 'created',
      old_status: null,
      new_status: status,
      triggered_by: 'admin_registration',
      actor_user_id: user.id,
      note: 'Registration created manually by admin',
    });

    // Send confirmation email (optional)
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (send_email !== false && resendKey) {
      const resend = new Resend(resendKey);
      const isDE = locale !== 'en';
      const classTitle = isDE ? danceClass.title_de : danceClass.title_en;
      const roleLabel = role === 'lead' ? (isDE ? 'Lead' : 'Lead') : (isDE ? 'Follow' : 'Follow');

      const subject = status === 'confirmed'
        ? (isDE ? `Anmeldung bestätigt: ${classTitle}` : `Registration confirmed: ${classTitle}`)
        : (isDE ? `Warteliste: ${classTitle}` : `Waitlisted: ${classTitle}`);

      const body = status === 'confirmed'
        ? (isDE
          ? `<h2>Hallo ${name.trim()}!</h2>
             <p>Du wurdest für <strong>${classTitle}</strong> als <strong>${roleLabel}</strong> angemeldet und deine Teilnahme ist bereits <strong>bestätigt</strong>. 🎉</p>
             <p>Wir freuen uns auf dich!</p>
             <p>Amadeus Shagadeus</p>`
          : `<h2>Hello ${name.trim()}!</h2>
             <p>You have been registered for <strong>${classTitle}</strong> as <strong>${roleLabel}</strong> and your spot is already <strong>confirmed</strong>. 🎉</p>
             <p>We look forward to seeing you!</p>
             <p>Amadeus Shagadeus</p>`)
        : (isDE
          ? `<h2>Hallo ${name.trim()}!</h2>
             <p>Du wurdest für <strong>${classTitle}</strong> als <strong>${roleLabel}</strong> auf die <strong>Warteliste</strong> gesetzt.</p>
             <p>Wir melden uns, sobald ein Platz frei wird.</p>
             <p>Amadeus Shagadeus</p>`
          : `<h2>Hello ${name.trim()}!</h2>
             <p>You have been placed on the <strong>waitlist</strong> for <strong>${classTitle}</strong> as <strong>${roleLabel}</strong>.</p>
             <p>We will notify you when a spot becomes available.</p>
             <p>Amadeus Shagadeus</p>`);

      try {
        const { data: sendData, error: sendError } = await resend.emails.send({
          from: Deno.env.get('EMAIL_FROM') || 'Amadeus Shagadeus <onboarding@resend.dev>',
          to: [normalizedEmail],
          subject,
          html: body,
        });
        if (sendError) {
          console.error('Email send failed:', sendError);
          await insertHistory({
            registration_id: registration.id,
            dance_class_id,
            event_type: 'email_failed',
            triggered_by: 'admin_registration',
            actor_user_id: user.id,
            email_type: 'participant_confirmation',
            email_recipient: normalizedEmail,
            email_subject: subject,
            note: sendError.message || 'Admin participant email failed',
            metadata: sendError,
          });
        } else {
          await insertHistory({
            registration_id: registration.id,
            dance_class_id,
            event_type: 'email_sent',
            triggered_by: 'admin_registration',
            actor_user_id: user.id,
            email_type: 'participant_confirmation',
            email_recipient: normalizedEmail,
            email_subject: subject,
            metadata: sendData,
          });
        }
      } catch (mailErr) {
        // Do not fail the registration if email sending fails
        console.error('Email send failed:', mailErr);
        await insertHistory({
          registration_id: registration.id,
          dance_class_id,
          event_type: 'email_failed',
          triggered_by: 'admin_registration',
          actor_user_id: user.id,
          email_type: 'participant_confirmation',
          email_recipient: normalizedEmail,
          email_subject: subject,
          note: mailErr instanceof Error ? mailErr.message : String(mailErr),
        });
      }
    } else if (send_email === false) {
      await insertHistory({
        registration_id: registration.id,
        dance_class_id,
        event_type: 'email_skipped',
        triggered_by: 'admin_registration',
        actor_user_id: user.id,
        email_type: 'participant_confirmation',
        email_recipient: normalizedEmail,
        note: 'Email sending disabled by admin input',
      });
    } else {
      await insertHistory({
        registration_id: registration.id,
        dance_class_id,
        event_type: 'email_skipped',
        triggered_by: 'admin_registration',
        actor_user_id: user.id,
        email_type: 'participant_confirmation',
        email_recipient: normalizedEmail,
        note: 'RESEND_API_KEY is not configured',
      });
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
