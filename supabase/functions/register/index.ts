import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'https://esm.sh/resend@4';
import { REPLY_TO, htmlToText, wrapHtml } from '../_shared/email.ts';

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
  // Requests without Origin are treated as non-browser/internal calls.
  if (!originHeader) return true;
  try {
    return allowedOrigins.has(new URL(originHeader).origin.replace(/\/$/, ''));
  } catch {
    return false;
  }
}

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function getClientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }

  const candidates = [
    req.headers.get('fly-client-ip'),
    req.headers.get('x-real-ip'),
    req.headers.get('cf-connecting-ip'),
  ];

  return candidates.find(Boolean) ?? null;
}

Deno.serve(async (req) => {
  if (!isAllowedOrigin(req.headers.get('origin'))) {
    return jsonResponse({ error: 'Forbidden origin', code: 'FORBIDDEN_ORIGIN' }, 403);
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const {
      dance_class_id,
      role,
      name,
      email,
      partner_name,
      comment,
      locale,
      website,
    } = await req.json();

    const normalizedEmail = typeof email === 'string' ? email.toLowerCase().trim() : '';
    const normalizedName = typeof name === 'string' ? name.trim() : '';
    const normalizedPartnerName = typeof partner_name === 'string' ? partner_name.trim() : '';
    const normalizedComment = typeof comment === 'string' ? comment.trim() : '';
    const honeypotValue = typeof website === 'string' ? website.trim() : '';

    // Input validation
    if (!dance_class_id || !role || !normalizedName || !normalizedEmail) {
      return jsonResponse({ error: 'Missing required fields', code: 'VALIDATION' }, 400);
    }

    if (!['lead', 'follow'].includes(role)) {
      return jsonResponse({ error: 'Invalid role', code: 'VALIDATION' }, 400);
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return jsonResponse({ error: 'Invalid email', code: 'VALIDATION' }, 400);
    }

    // Create Supabase client with service role key (bypasses RLS)
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

    if (honeypotValue) {
      return jsonResponse({ success: true, trapped: true }, 202);
    }

    // Check if class exists and is open
    const { data: danceClass, error: classError } = await supabase
      .from('dance_classes')
      .select('*')
      .eq('id', dance_class_id)
      .single();

    if (classError || !danceClass) {
      return jsonResponse({ error: 'Dance class not found', code: 'NOT_FOUND' }, 404);
    }

    const now = new Date();

    // Registration opens at a specific time if configured.
    if (danceClass.registration_opens_at && new Date(danceClass.registration_opens_at) > now) {
      return jsonResponse({ error: 'Registration is closed', code: 'CLOSED' }, 400);
    }

    if (danceClass.registration_closes_at && new Date(danceClass.registration_closes_at) < now) {
      return jsonResponse({ error: 'Registration deadline has passed', code: 'CLOSED' }, 400);
    }

    // Check for duplicate
    const { data: existing } = await supabase
      .from('registrations')
      .select('id')
      .eq('dance_class_id', dance_class_id)
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (existing) {
      return jsonResponse({ error: 'Already registered', code: 'DUPLICATE' }, 409);
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
    const normalizedLocale = locale === 'en' ? 'en' : 'de';
    const { data: registration, error: insertError } = await supabase
      .from('registrations')
      .insert({
        dance_class_id,
        email: normalizedEmail,
        name: normalizedName,
        role,
        partner_name: normalizedPartnerName || null,
        comment: normalizedComment || null,
        status,
        locale: normalizedLocale,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      return jsonResponse({ error: 'Registration failed', code: 'INSERT_ERROR' }, 500);
    }

    await insertHistory({
      registration_id: registration.id,
      dance_class_id,
      event_type: 'created',
      old_status: null,
      new_status: status,
      triggered_by: 'public_registration',
      note: 'Registration created via public form',
    });

    // Send confirmation email via Resend
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) {
      console.warn('RESEND_API_KEY is not set - skipping email send');
      await insertHistory({
        registration_id: registration.id,
        dance_class_id,
        event_type: 'email_skipped',
        triggered_by: 'public_registration',
        email_type: 'participant_confirmation',
        email_recipient: normalizedEmail,
        note: 'RESEND_API_KEY is not configured',
      });
    }
    if (resendKey) {
      const resend = new Resend(resendKey);
      const isDE = locale === 'de';
      const classTitle = isDE ? danceClass.title_de : danceClass.title_en;
      const fromAddress = Deno.env.get('EMAIL_FROM') || 'Amadeus Shagadeus <onboarding@resend.dev>';
      const overrideTo = Deno.env.get('EMAIL_TO_OVERRIDE');
      const realTo = normalizedEmail;
      const toAddress = overrideTo || realTo;
      const organizerRealTo = Deno.env.get('ORGANIZER_NOTIFICATION_EMAIL') || 'info@shagadeus.at';
      const organizerToAddress = overrideTo || organizerRealTo;
      const participantSubject = isDE
        ? `Anmeldung eingegangen: ${classTitle}`
        : `Registration received: ${classTitle}`;
      const organizerSubject = `Neue Anmeldung: ${classTitle}`;
      if (overrideTo) {
        console.log(`EMAIL_TO_OVERRIDE active - redirecting mail for ${realTo} to ${overrideTo}`);
        console.log(`EMAIL_TO_OVERRIDE active - redirecting organizer mail for ${organizerRealTo} to ${overrideTo}`);
      }

      const teacherName = danceClass.teachers || 'Vera & Josef';
      const participantBody = isDE
      ? `<h2 style="margin:0 0 16px;font-size:20px;">Hallo ${normalizedName}!</h2>
           <p>Deine Anmeldung für <strong>${classTitle}</strong> als <strong>${role === 'lead' ? 'Lead' : 'Follow'}</strong> ist eingegangen.</p>
           ${status === 'waitlisted' ? '<p>Aktuell sind alle Plätze belegt. Du stehst auf der Warteliste.</p>' : ''}
           <p>Wir werden deine Anmeldung prüfen und bestätigen. Du erhältst dann eine weitere E-Mail.</p>
           <p>${teacherName}</p>`
      : `<h2 style="margin:0 0 16px;font-size:20px;">Hello ${normalizedName}!</h2>
           <p>Your registration for <strong>${classTitle}</strong> as <strong>${role === 'lead' ? 'Lead' : 'Follow'}</strong> has been received.</p>
           ${status === 'waitlisted' ? '<p>All spots are currently taken. You have been placed on the waitlist.</p>' : ''}
           <p>We will review and confirm your registration. You will then receive another email.</p>
           <p>${teacherName}</p>`;

      try {
        const { data: sendData, error: sendError } = await resend.emails.send({
          from: fromAddress,
          to: [toAddress],
          replyTo: REPLY_TO,
          subject: participantSubject,
          html: wrapHtml(participantBody, { title: participantSubject, preheader: isDE ? `Anmeldung für ${classTitle} eingegangen.` : `Registration for ${classTitle} received.` }),
          text: htmlToText(participantBody),
        });
        if (sendError) {
          console.error('Resend send error:', JSON.stringify(sendError), 'from:', fromAddress, 'to:', toAddress);
          await insertHistory({
            registration_id: registration.id,
            dance_class_id,
            event_type: 'email_failed',
            triggered_by: 'public_registration',
            email_type: 'participant_confirmation',
            email_recipient: toAddress,
            email_subject: participantSubject,
            note: sendError.message || 'Participant email failed',
            metadata: sendError,
          });
        } else {
          console.log('Resend send ok:', JSON.stringify(sendData), 'to:', toAddress);
          await insertHistory({
            registration_id: registration.id,
            dance_class_id,
            event_type: 'email_sent',
            triggered_by: 'public_registration',
            email_type: 'participant_confirmation',
            email_recipient: toAddress,
            email_subject: participantSubject,
            metadata: sendData,
          });
        }
      } catch (e) {
        console.error('Resend send threw:', e instanceof Error ? e.message : String(e), 'from:', fromAddress, 'to:', toAddress);
        await insertHistory({
          registration_id: registration.id,
          dance_class_id,
          event_type: 'email_failed',
          triggered_by: 'public_registration',
          email_type: 'participant_confirmation',
          email_recipient: toAddress,
          email_subject: participantSubject,
          note: e instanceof Error ? e.message : String(e),
        });
      }

    const organizerBody = `<h2 style="margin:0 0 16px;font-size:20px;">Neue Workshop-Anmeldung</h2>
         <p><strong>Workshop:</strong> ${danceClass.title_de} / ${danceClass.title_en}</p>
      <p><strong>Name:</strong> ${normalizedName}</p>
         <p><strong>E-Mail:</strong> ${realTo}</p>
         <p><strong>Rolle:</strong> ${role === 'lead' ? 'Lead' : 'Follow'}</p>
         <p><strong>Status:</strong> ${status}</p>
      ${normalizedPartnerName ? `<p><strong>Partner:</strong> ${normalizedPartnerName}</p>` : ''}
      ${normalizedComment ? `<p><strong>Kommentar:</strong> ${normalizedComment}</p>` : ''}`;

      try {
        const { data: organizerSendData, error: organizerSendError } = await resend.emails.send({
          from: fromAddress,
          to: [organizerToAddress],
          replyTo: realTo,
          subject: organizerSubject,
          html: wrapHtml(organizerBody, { title: organizerSubject }),
          text: htmlToText(organizerBody),
        });
        if (organizerSendError) {
          console.error('Resend organizer send error:', JSON.stringify(organizerSendError), 'from:', fromAddress, 'to:', organizerToAddress);
          await insertHistory({
            registration_id: registration.id,
            dance_class_id,
            event_type: 'email_failed',
            triggered_by: 'public_registration',
            email_type: 'organizer_notification',
            email_recipient: organizerToAddress,
            email_subject: organizerSubject,
            note: organizerSendError.message || 'Organizer email failed',
            metadata: organizerSendError,
          });
        } else {
          console.log('Resend organizer send ok:', JSON.stringify(organizerSendData), 'to:', organizerToAddress);
          await insertHistory({
            registration_id: registration.id,
            dance_class_id,
            event_type: 'email_sent',
            triggered_by: 'public_registration',
            email_type: 'organizer_notification',
            email_recipient: organizerToAddress,
            email_subject: organizerSubject,
            metadata: organizerSendData,
          });
        }
      } catch (e) {
        console.error('Resend organizer send threw:', e instanceof Error ? e.message : String(e), 'from:', fromAddress, 'to:', organizerToAddress);
        await insertHistory({
          registration_id: registration.id,
          dance_class_id,
          event_type: 'email_failed',
          triggered_by: 'public_registration',
          email_type: 'organizer_notification',
          email_recipient: organizerToAddress,
          email_subject: organizerSubject,
          note: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return jsonResponse({ success: true, status, id: registration.id }, 201);
  } catch (err) {
    console.error('Unexpected error:', err);
    return jsonResponse({ error: 'Internal server error', code: 'SERVER_ERROR' }, 500);
  }
});
