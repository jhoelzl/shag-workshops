import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'https://esm.sh/resend@4';
import { REPLY_TO, htmlToText, wrapHtml } from '../_shared/email.ts';
import { buildIcsContent } from '../_shared/calendar.ts';
import {
  renderWorkshopBoxHtml,
  renderWorkshopBoxText,
  workshopBoxIcsFilename,
  type WorkshopBoxInput,
} from '../_shared/workshop-box.ts';

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

    const insertHistory = async (entry: Record<string, unknown>) => {
      const { error } = await supabase.from('registration_history').insert(entry);
      if (error) {
        console.error('History insert failed:', error);
      }
    };

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

    await insertHistory({
      registration_id,
      dance_class_id: registration.dance_class_id,
      event_type: 'status_changed',
      old_status: registration.status,
      new_status: new_status,
      triggered_by: 'admin_status_change',
      actor_user_id: user.id,
      note: registration.status === new_status ? 'Status update requested with same value' : 'Status changed by admin',
    });

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
               <p>Deine Anmeldung für <strong>${dc.title_de}</strong> wurde <strong>bestätigt</strong>!</p>
               <p>Wir freuen uns auf dich!</p>
               <p>Vera & Josef</p>`,
          en: `<h2>Hello ${registration.name}!</h2>
               <p>Your registration for <strong>${dc.title_en}</strong> has been <strong>confirmed</strong>!</p>
               <p>We look forward to seeing you!</p>
               <p>Vera & Josef</p>`,
        },
        waitlisted: {
          de: `<h2>Hallo ${registration.name}!</h2>
               <p>Du stehst jetzt auf der <strong>Warteliste</strong> für <strong>${dc.title_de}</strong>.</p>
               <p>Wir melden uns, sobald ein Platz frei wird.</p>
               <p>Vera & Josef</p>`,
          en: `<h2>Hello ${registration.name}!</h2>
               <p>You have been placed on the <strong>waitlist</strong> for <strong>${dc.title_en}</strong>.</p>
               <p>We will notify you when a spot becomes available.</p>
               <p>Vera & Josef</p>`,
        },
        cancelled: {
          de: `<h2>Hallo ${registration.name}!</h2>
               <p>Leider wurde deine Anmeldung für <strong>${dc.title_de}</strong> <strong>abgesagt</strong>.</p>
               <p>Bei Fragen kontaktiere uns gerne.</p>
               <p>Vera & Josef</p>`,
          en: `<h2>Hello ${registration.name}!</h2>
               <p>Unfortunately your registration for <strong>${dc.title_en}</strong> has been <strong>cancelled</strong>.</p>
               <p>Please contact us if you have any questions.</p>
               <p>Vera & Josef</p>`,
        },
      };

      // Use the locale captured at signup time so the participant gets the
      // mail in the same language they registered in. Fall back to German.
      const lang: 'de' | 'en' = registration.locale === 'en' ? 'en' : 'de';
      const fromAddress = Deno.env.get('EMAIL_FROM') || 'Amadeus Shagadeus <onboarding@resend.dev>';
      const overrideTo = Deno.env.get('EMAIL_TO_OVERRIDE');
      const toAddress = overrideTo || registration.email;
      const subject = subjects[new_status][lang];
      if (overrideTo) {
        console.log(`EMAIL_TO_OVERRIDE active - redirecting mail for ${registration.email} to ${overrideTo}`);
      }

      try {
        const body = bodies[new_status][lang];

        // For confirmed registrations, inject a workshop summary box with
        // calendar export links and attach an ICS file. The plain-text
        // fallback is built directly (not stripped from HTML) so that
        // text-only clients receive all the workshop details verbatim.
        let htmlBody = body;
        let textBody = htmlToText(body);
        // deno-lint-ignore no-explicit-any
        const attachments: any[] = [];

        if (new_status === 'confirmed') {
          const { data: sessions } = await supabase
            .from('class_sessions')
            .select('*')
            .eq('dance_class_id', registration.dance_class_id)
            .order('session_date', { ascending: true })
            .order('start_time', { ascending: true });

          const workshopPageUrl = lang === 'de'
            ? 'https://shagadeus.at/de/workshops'
            : 'https://shagadeus.at/en/workshops';

          const boxInput: WorkshopBoxInput = {
            classId: dc.id,
            titleDe: dc.title_de,
            titleEn: dc.title_en,
            dance: dc.dance,
            teachers: dc.teachers,
            level: dc.level,
            location: dc.location,
            locationDetails: dc.location_details,
            locationUrl: dc.location_url,
            priceEur: dc.price_eur,
            isDonation: dc.is_donation,
            sessions: sessions ?? [],
            workshopPageUrl,
            lang,
          };

          const boxHtml = renderWorkshopBoxHtml(boxInput);
          const boxText = renderWorkshopBoxText(boxInput);

          // Insert the workshop box between the greeting and the signature.
          // The signature line begins with "<p>Vera & Josef</p>" in all locales.
          const signatureMarker = '<p>Vera &amp; Josef</p>';
          const bodyEscaped = body.replace(/Vera & Josef/g, 'Vera &amp; Josef');
          htmlBody = bodyEscaped.includes(signatureMarker)
            ? bodyEscaped.replace(signatureMarker, `${boxHtml}\n${signatureMarker}`)
            : `${bodyEscaped}\n${boxHtml}`;

          // Compose plain-text fallback from base text + workshop box text.
          const baseText = htmlToText(body);
          const sigIdx = baseText.indexOf('Vera & Josef');
          textBody = sigIdx >= 0
            ? `${baseText.slice(0, sigIdx).trimEnd()}\n\n${boxText}\n\n${baseText.slice(sigIdx)}`
            : `${baseText}\n\n${boxText}`;

          // Build ICS attachment (only if at least one valid session exists).
          const icsContent = buildIcsContent(
            {
              id: dc.id,
              title: lang === 'de' ? dc.title_de : dc.title_en,
              location: dc.location,
              locationDetails: dc.location_details,
              url: workshopPageUrl,
            },
            sessions ?? []
          );
          if (icsContent) {
            // UTF-8 → base64 (icsContent may contain umlauts / non-ASCII).
            const utf8Bytes = new TextEncoder().encode(icsContent);
            let binary = '';
            for (let i = 0; i < utf8Bytes.length; i++) {
              binary += String.fromCharCode(utf8Bytes[i]);
            }
            attachments.push({
              filename: workshopBoxIcsFilename(boxInput),
              content: btoa(binary),
              contentType: 'text/calendar; charset=utf-8; method=PUBLISH',
            });
          }
        }

        const { data: sendData, error: sendError } = await resend.emails.send({
          from: fromAddress,
          to: [toAddress],
          replyTo: REPLY_TO,
          subject,
          html: wrapHtml(htmlBody, { title: subject }),
          text: textBody,
          ...(attachments.length ? { attachments } : {}),
        });
        if (sendError) {
          console.error('Resend send error:', JSON.stringify(sendError), 'from:', fromAddress, 'to:', toAddress);
          await insertHistory({
            registration_id,
            dance_class_id: registration.dance_class_id,
            event_type: 'email_failed',
            triggered_by: 'admin_status_change',
            actor_user_id: user.id,
            email_type: 'participant_status_update',
            email_recipient: toAddress,
            email_subject: subject,
            note: sendError.message || 'Status update email failed',
            metadata: sendError,
          });
        } else {
          console.log('Resend send ok:', JSON.stringify(sendData), 'to:', toAddress);
          await insertHistory({
            registration_id,
            dance_class_id: registration.dance_class_id,
            event_type: 'email_sent',
            triggered_by: 'admin_status_change',
            actor_user_id: user.id,
            email_type: 'participant_status_update',
            email_recipient: toAddress,
            email_subject: subject,
            metadata: sendData,
          });
        }
      } catch (e) {
        console.error('Resend send threw:', e instanceof Error ? e.message : String(e), 'from:', fromAddress, 'to:', toAddress);
        await insertHistory({
          registration_id,
          dance_class_id: registration.dance_class_id,
          event_type: 'email_failed',
          triggered_by: 'admin_status_change',
          actor_user_id: user.id,
          email_type: 'participant_status_update',
          email_recipient: toAddress,
          email_subject: subject,
          note: e instanceof Error ? e.message : String(e),
        });
      }
    } else {
      await insertHistory({
        registration_id,
        dance_class_id: registration.dance_class_id,
        event_type: 'email_skipped',
        triggered_by: 'admin_status_change',
        actor_user_id: user.id,
        email_type: 'participant_status_update',
        email_recipient: registration.email,
        note: 'RESEND_API_KEY is not configured',
      });
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
