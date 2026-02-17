from django.conf import settings
from django.utils import timezone
from datetime import timedelta
from twilio.rest import Client
from home_page.models import NotificationPreference, SentNotification
from home_page.services.calendar_service import GoogleCalendarService
import logging
from django.db.models import Q
from home_page.services.ai_agent import AIAgent
from concurrent.futures import ThreadPoolExecutor
from django.core.cache import cache
import json
import requests

logger = logging.getLogger(__name__)


def send_email_zeptomail(to_email, subject, body):
    """
    Sends an email using ZeptoMail (Zoho's transactional email API).
    Uses HTTPS so it works on Railway Hobby plan (SMTP ports are blocked).
    
    Required settings:
    - ZEPTOMAIL_API_TOKEN: Your ZeptoMail Send Mail token
    - ZEPTOMAIL_FROM_EMAIL: The verified sender email address
    - ZEPTOMAIL_FROM_NAME: (Optional) The sender display name
    """
    api_token = getattr(settings, 'ZEPTOMAIL_API_TOKEN', None)
    from_email = getattr(settings, 'ZEPTOMAIL_FROM_EMAIL', None) or getattr(settings, 'EMAIL_HOST_USER', None)
    from_name = getattr(settings, 'ZEPTOMAIL_FROM_NAME', 'Reminder Agent')
    
    if not api_token:
        logger.error("ZEPTOMAIL_API_TOKEN not configured")
        return False
    
    if not from_email:
        logger.error("ZEPTOMAIL_FROM_EMAIL not configured")
        return False
    
    url = "https://api.zeptomail.com/v1.1/email"
    
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": api_token  # ZeptoMail uses the token directly, not "Bearer <token>"
    }
    
    payload = {
        "from": {
            "address": from_email,
            "name": from_name
        },
        "to": [
            {
                "email_address": {
                    "address": to_email
                }
            }
        ],
        "subject": subject,
        "textbody": body
    }
    
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        
        if response.status_code == 200 or response.status_code == 201:
            logger.info(f"ZeptoMail: Email sent to {to_email}")
            return True
        elif response.status_code == 429:
            logger.error(f"ZeptoMail Rate Limit Exceeded: {response.text}")
            return False
        else:
            logger.error(f"ZeptoMail API error: {response.status_code} - {response.text}")
            return False
            
    except requests.exceptions.Timeout:
        logger.error(f"ZeptoMail: Request timed out for {to_email}")
        return False
    except Exception as e:
        logger.error(f"ZeptoMail: Failed to send email to {to_email}: {e}")
        return False


def send_whatsapp_message(to_number, body=None, content_sid=None, content_variables=None, header_text=None):
    """
    Sends a WhatsApp message using Twilio.
    Supports raw body OR Content Templates (content_sid + content_variables).
    """
    try:
        account_sid = getattr(settings, 'TWILIO_ACCOUNT_SID', None)
        auth_token = getattr(settings, 'TWILIO_AUTH_TOKEN', None)
        from_number = getattr(settings, 'TWILIO_WHATSAPP_NUMBER', None) or getattr(settings, 'TWILIO_PHONE_NUMBER', None)

        if not all([account_sid, auth_token, from_number]):
            logger.error("Twilio credentials missing. Cannot send WhatsApp message.")
            return False

        # Ensure from_number is in whatsapp format
        if not from_number.startswith('whatsapp:'):
            from_number = f"whatsapp:{from_number}"

        client = Client(account_sid, auth_token)
        
        # Ensure to_number is in whatsapp format
        if not to_number.startswith('whatsapp:'):
            to_number = f"whatsapp:{to_number}"

        if content_sid:
            try:
                 message = client.messages.create(
                    from_=from_number,
                    to=to_number,
                    content_sid=content_sid,
                    content_variables=content_variables
                )
                 logger.info(f"WhatsApp template message sent to {to_number}: {message.sid}")
                 return True
            except Exception as e:
                logger.warning(f"Failed to send WhatsApp template to {to_number}: {e} (Code: {getattr(e, 'code', 'N/A')}). Falling back to standard message.")
                # Fall through to body send

        if body:
            message = client.messages.create(
                from_=from_number,
                body=body,
                to=to_number
            )
            logger.info(f"WhatsApp message sent to {to_number}: {message.sid}")
            return True
            
        return False
    except Exception as e:
        logger.error(f"Failed to send WhatsApp message to {to_number}: {e}")
        return False

def check_and_send_reminders():
    """
    Polls for upcoming events (next 30 mins) and sends reminders.
    Intended to be called periodically (e.g. every minute).
    """
    logger.info("Checking for reminders...")
    
    # 1. Get all users who have notification preferences enabled
    preferences = NotificationPreference.objects.filter(
        Q(whatsapp_enabled=True) | Q(email_enabled=True)
    ).select_related('user')

    # Run sequentially to avoid SSL/Threading issues
    for pref in preferences:
        try:
            process_user_reminders(pref)
        except Exception as e:
            logger.error(f"Error processing user {pref.user}: {e}")

def process_user_reminders(pref):
    """
    Process reminders for a single user with their specific preferences.
    """
    user = pref.user
    
    # Use user's specific lookahead time (default 30 mins)
    lead_time = getattr(pref, 'reminder_lead_time', 30)
    
    now = timezone.now()
    lookahead = now + timedelta(minutes=lead_time)
    
    logger.info(f"Checking events for user: {user.username} (Lookahead: {lead_time}m)")

    try:
        try:
            cal_service = GoogleCalendarService(user)
        except Exception as e:
            # Check for auth errors to avoid spamming logs
            str_e = str(e)
            if any(x in str_e for x in ["insufficientPermissions", "403", "invalid_grant", "reconnect", "expired", "refresh token"]):
                 logger.warning(f"Skipping reminders for {user.username}: Auth error (needs reconnect).")
            else:
                 logger.warning(f"Could not init calendar service for {user.username}: {e}")
            return

        # List events
        events = cal_service.list_events(
            time_min=now.isoformat(),
            time_max=lookahead.isoformat()
        )
        
        if not events:
            return
        
        ai_agent = AIAgent(user)

        for event in events:
            try:
                event_id = event['id']
                summary = event.get('summary', '(No Title)')
                start_raw = event.get('start', {}).get('dateTime', event.get('start', {}).get('date'))
                
                # Deduplication logic
                already_notified_whatsapp = False
                already_notified_email = False
                
                if pref.whatsapp_enabled:
                    already_notified_whatsapp = SentNotification.objects.filter(
                        user=user, event_id=event_id, notification_type='whatsapp', status='sent'
                    ).exists()
                    
                    # Check for active snooze (if not already found as sent)
                    if not already_notified_whatsapp:
                        last_snooze = SentNotification.objects.filter(
                            user=user, event_id=event_id, notification_type='whatsapp', status='snoozed'
                        ).order_by('-timestamp').first()
                        
                        if last_snooze:
                            # If snoozed less than 10 mins ago, treat as active (don't send yet)
                            if timezone.now() < last_snooze.timestamp + timedelta(minutes=10):
                                already_notified_whatsapp = True
                    # Also check failure count? If failed 3 times, treat as "done" (gave up)
                    failed_count_wa = SentNotification.objects.filter(
                         user=user, event_id=event_id, notification_type='whatsapp', status='failed'
                    ).count()
                    if failed_count_wa >= 3:
                        logger.info(f"Skipping WA for {event_id}: too many failures.")
                        already_notified_whatsapp = True
                    
                if pref.email_enabled:
                     already_notified_email = SentNotification.objects.filter(
                        user=user, event_id=event_id, notification_type='email', status='sent'
                    ).exists()
                     failed_count_email = SentNotification.objects.filter(
                         user=user, event_id=event_id, notification_type='email', status='failed'
                    ).count()
                     if failed_count_email >= 3:
                         logger.info(f"Skipping Email for {event_id}: too many failures.")
                         already_notified_email = True

                # If both notified (or disabled), skip
                if (not pref.whatsapp_enabled or already_notified_whatsapp) and \
                   (not pref.email_enabled or already_notified_email):
                    continue

                # Generate AI Message             
                ai_message = ai_agent.generate_reminder_message(summary, start_raw, user.username)
                
                if pref.whatsapp_enabled and pref.whatsapp_number and not already_notified_whatsapp:
                    wa_body = ai_message
                    
                    template_sid = getattr(settings, 'TWILIO_WHATSAPP_TEMPLATE_SID', None)
                    if template_sid:
                        var_name_body = getattr(settings, 'TWILIO_WHATSAPP_TEMPLATE_VARIABLE_BODY', '1')
                        var_name_header = getattr(settings, 'TWILIO_WHATSAPP_TEMPLATE_VARIABLE_HEADER', '2')
                        
                        flat_body = wa_body.replace('\n', ' | ')
                        # Truncate to avoid length limits (Twilio ~1024 chars TOTAL for template).
                        # Reducing to 800 to be safe (allowing for static text + other vars).
                        if len(flat_body) > 800:
                            flat_body = flat_body[:797] + "..."
                        
                        variables = {var_name_body: flat_body}
                        # Header is "Event Reminder"
                        variables[var_name_header] = "Event Reminder"

                        success = send_whatsapp_message(
                            pref.whatsapp_number, 
                            body=wa_body, # Fallback
                            content_sid=template_sid, 
                            content_variables=json.dumps(variables, ensure_ascii=False)
                        )
                    else:
                        # Use Session Message (Standard)
                        success = send_whatsapp_message(pref.whatsapp_number, body=wa_body)
                        
                    status_val = 'sent' if success else 'failed'
                    
                    # Log attempt
                    SentNotification.objects.create(
                        user=user,
                        event_id=event_id,
                        notification_type='whatsapp',
                        status=status_val
                    )
                    
                # --- Email ---
                if pref.email_enabled and not already_notified_email:
                    to_email = user.email
                    subject = f"Reminder: {summary}"
                    # Common body content
                    email_body_text = f"{ai_message}\n\nBest,\nReminder Agent"
                    
                    success_email = False
                    logger.info(f"Sending email for event {event_id} to {to_email}")
                    
                    # Try ZeptoMail API first (works on Railway - uses HTTPS, not blocked SMTP ports)
                    if getattr(settings, 'ZEPTOMAIL_API_TOKEN', None):
                        success_email = send_email_zeptomail(to_email, subject, email_body_text)
                        if success_email:
                            logger.info(f"ZeptoMail email sent to {to_email} for event {summary}")
                    
                    # Fallback to SMTP if ZeptoMail not configured or failed (for local dev)
                    if not success_email and settings.EMAIL_HOST_USER and settings.EMAIL_HOST_PASSWORD:
                        try:
                            from django.core.mail import get_connection, EmailMessage
                            
                            # Create connection with explicit timeout (10s)
                            connection = get_connection(
                                backend='django.core.mail.backends.smtp.EmailBackend',
                                host=settings.EMAIL_HOST,
                                port=settings.EMAIL_PORT,
                                username=settings.EMAIL_HOST_USER,
                                password=settings.EMAIL_HOST_PASSWORD,
                                use_tls=settings.EMAIL_USE_TLS,
                                use_ssl=settings.EMAIL_USE_SSL,
                                timeout=10  # Short timeout to fail fast
                            )
                            
                            email = EmailMessage(
                                subject=subject,
                                body=email_body_text,
                                from_email=settings.EMAIL_HOST_USER,
                                to=[to_email],
                                connection=connection
                            )
                            email.send(fail_silently=False)
                            logger.info(f"SMTP Email sent to {to_email} for event {summary}")
                            success_email = True
                        except Exception as smtp_err:
                            logger.error(f"SMTP email failed to {to_email}: {smtp_err}")
                            success_email = False
                    
                    status_val = 'sent' if success_email else 'failed'
                    SentNotification.objects.create(
                        user=user,
                        event_id=event_id,
                        notification_type='email',
                        status=status_val
                    )
                    
            except Exception as ev_e:
                 logger.error(f"Error processing event {event.get('id')}: {ev_e}")

    except Exception as e:
        logger.error(f"Error processing user {user.username}: {e}")

def check_and_send_morning_briefings():
    """
    Checks if it's time to send morning briefings for users.
    Should be called periodically (e.g., every minute).
    """
    # logger.info("Checking for morning briefings...") # Verbose
    now_utc = timezone.now()
    
    # Filter users with morning briefing enabled
    preferences = NotificationPreference.objects.filter(morning_briefing_enabled=True).select_related('user')
    
    for pref in preferences:
        briefing_time = pref.morning_briefing_time
        
        # Get user's timezone (default to UTC if not set)
        try:
            from zoneinfo import ZoneInfo
            user_tz = ZoneInfo(pref.user_timezone or 'UTC')
        except Exception:
            user_tz = timezone.utc
        
        # Convert current UTC time to user's local time
        now_local = now_utc.astimezone(user_tz)
        current_time_local = now_local.time()
        
        # Check if current LOCAL time is within a 5-minute window
        # This handles minor cron delays or seconds mismatches
        # Convert to minutes for easier comparison
        target_minutes = briefing_time.hour * 60 + briefing_time.minute
        current_minutes = current_time_local.hour * 60 + current_time_local.minute
        
        # Match if within 0-5 mins after target time
        diff = current_minutes - target_minutes
        if 0 <= diff < 5:
             today_str = now_local.strftime("%Y-%m-%d")
             cache_key = f"morning_briefing_{pref.user.id}_{today_str}"
             
             if not cache.get(cache_key):
                 logger.info(f"Sending morning briefing for {pref.user.username}")
                 try:
                     # 1. Fetch today's events
                     try:
                        cal_service = GoogleCalendarService(pref.user)
                     except Exception as e:
                        logger.warning(f"Skipping briefing for {pref.user.username}, calendar service error: {e}")
                        continue

                     start_of_day = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
                     end_of_day = now_local.replace(hour=23, minute=59, second=59, microsecond=999999)
                     
                     events = cal_service.list_events(
                         time_min=start_of_day.isoformat(),
                         time_max=end_of_day.isoformat()
                     )
                     
                     # 2. Generate briefing
                     ai_agent = AIAgent(pref.user)
                     briefing_msg = ai_agent.generate_morning_briefing(events, pref.user.first_name or pref.user.username)
                     
                     # 3. Send via WhatsApp
                     if pref.whatsapp_number:
                         template_sid = getattr(settings, 'TWILIO_WHATSAPP_TEMPLATE_SID', None)
                         if template_sid:
                                var_name_body = getattr(settings, 'TWILIO_WHATSAPP_TEMPLATE_VARIABLE_BODY', '1')
                                var_name_header = getattr(settings, 'TWILIO_WHATSAPP_TEMPLATE_VARIABLE_HEADER', '2')
                                
                                flat_briefing = briefing_msg.replace('\n', ' | ')
                                # Truncate briefing
                                if len(flat_briefing) > 1000:
                                    flat_briefing = flat_briefing[:997] + "..."
                                
                                variables = {var_name_body: flat_briefing}
                                variables[var_name_header] = "Morning Briefing"
                               
                                send_whatsapp_message(
                                   pref.whatsapp_number,
                                   body=briefing_msg, 
                                   content_sid=template_sid, 
                                   content_variables=json.dumps(variables, ensure_ascii=False)
                               )
                         else:
                               send_whatsapp_message(pref.whatsapp_number, body=briefing_msg)
                         
                         logger.info(f"Sent morning briefing to {pref.user.username}")
                     else:
                         logger.warning(f"User {pref.user.username} has no WhatsApp number for briefing.")

                     # 4. Send Email (Added)
                     if pref.email_enabled:
                         try:
                             to_email = pref.user.email
                             subject = f"Morning Briefing: {today_str}"
                             # Simple body
                             email_body_text = f"{briefing_msg}\n\nBest,\nReminder Agent"
                             
                             # ZeptoMail
                             success_email = False
                             if getattr(settings, 'ZEPTOMAIL_API_TOKEN', None):
                                 success_email = send_email_zeptomail(to_email, subject, email_body_text)
                             
                             # SMTP Fallback
                             if not success_email and settings.EMAIL_HOST_USER:
                                 from django.core.mail import send_mail
                                 send_mail(subject, email_body_text, settings.EMAIL_HOST_USER, [to_email], fail_silently=True)
                                 
                             logger.info(f"Morning Briefing Email sent to {to_email}")
                         except Exception as e_em:
                             logger.error(f"Failed to send briefing email: {e_em}")

                     # 5. Mark as sent
                     cache.set(cache_key, True, timeout=86400) # 24h
                     
                 except Exception as e:
                     logger.error(f"Failed to send briefing to {pref.user.username}: {e}")
