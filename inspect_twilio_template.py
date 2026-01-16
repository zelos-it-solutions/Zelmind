
import os
import django
import json
from twilio.rest import Client

# Setup Django standalone
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'project.settings')
django.setup()

from django.conf import settings

def inspect_template():
    account_sid = getattr(settings, 'TWILIO_ACCOUNT_SID', None)
    auth_token = getattr(settings, 'TWILIO_AUTH_TOKEN', None)
    template_sid = getattr(settings, 'TWILIO_WHATSAPP_TEMPLATE_SID', None)
    
    print(f"\n--- Inspecting Template: {template_sid} ---")
    
    if not all([account_sid, auth_token, template_sid]):
        print("❌ Missing configuration! Check TWILIO_ACCOUNT_SID, AUTH_TOKEN, TEMPLATE_SID.")
        return

    client = Client(account_sid, auth_token)

    try:
        # Fetch the Content Template details
        # Note: This uses the Content API (v1)
        content = client.content.v1.contents(template_sid).fetch()
        
        print(f"✅ Template Found: {content.friendly_name}")
        print(f"   SID: {content.sid}")
        print(f"   Variables: {content.variables}")
        print(f"   Types: {json.dumps(content.types, indent=2)}")
        
    except Exception as e:
        print(f"   ❌ FAILED to fetch template: {e}")
        if hasattr(e, 'code'):
            print(f"   Twilio Error Code: {e.code}")

if __name__ == "__main__":
    inspect_template()
