
import os
import django
import json
from twilio.rest import Client

# Setup Django standalone
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'project.settings')
django.setup()

from django.conf import settings

def debug_content_delivery():
    account_sid = getattr(settings, 'TWILIO_ACCOUNT_SID', None)
    auth_token = getattr(settings, 'TWILIO_AUTH_TOKEN', None)
    from_number = getattr(settings, 'TWILIO_PHONE_NUMBER', None)
    to_number = getattr(settings, 'WHATSAPP_TEST_NUMBER', None) or getattr(settings, 'MY_WHATSAPP_NUMBER', None)
    
    template_sid = getattr(settings, 'TWILIO_WHATSAPP_TEMPLATE_SID', None)
    var_body = getattr(settings, 'TWILIO_WHATSAPP_TEMPLATE_VARIABLE_BODY', '1')
    var_header = getattr(settings, 'TWILIO_WHATSAPP_TEMPLATE_VARIABLE_HEADER', '2')
    
    print(f"\n--- WhatsApp Content Debugger ---")
    print(f"To: {to_number}")
    print(f"Template: {template_sid}")
    
    # Ensure whatsapp: prefix
    if from_number and not from_number.startswith('whatsapp:'):
        from_number = f"whatsapp:{from_number}"
    
    if to_number and not to_number.startswith('whatsapp:'):
        to_number = f"whatsapp:{to_number}"

    print(f"From: {from_number}")
    
    client = Client(account_sid, auth_token)

    # Check variables
    print(f"Var Body Key: '{var_body}'")
    print(f"Var Header Key: '{var_header}'")

    # Test Cases
    tests = [
        {
            "name": "1. Simple Text",
            "body": "This is a simple test."
        },
        {
            "name": "2. With Separators ( | )",
            "body": "Start: 10:00am | Event: Testing Separators | Status: Active"
        },
        {
            "name": "3. With Emojis 📅",
            "body": "📅 Event Reminder | ⏰ 10:00am"
        },
        {
            "name": "4. Full Simulated AI Message",
            "body": "📅 Team Review Meeting | ⏰ 11:20pm | 📝 Review weekly progress"
        }
    ]

    for test in tests:
        print(f"\n[{test['name']}] Sending...")
        try:
            # Construct variables
            variables = {
                var_body: test["body"],
                var_header: "Debug Test" # Mandatory header
            }
            
            # Send
            message = client.messages.create(
                from_=from_number,
                to=to_number,
                content_sid=template_sid,
                content_variables=json.dumps(variables, ensure_ascii=False) # TRY FALSE 
            )
            print(f"   ✅ Sent! SID: {message.sid}")
            print(f"   Status: {message.status}")
            print(f"   Variables JSON: {json.dumps(variables, ensure_ascii=True)}")
            print("   👉 CHECK YOUR PHONE NOW.")
            input("   Press Enter to continue to next test...")
            
        except Exception as e:
            print(f"   ❌ FAILED: {e}")
            if hasattr(e, 'code'):
                print(f"   Twilio Error Code: {e.code}")

if __name__ == "__main__":
    debug_content_delivery()
