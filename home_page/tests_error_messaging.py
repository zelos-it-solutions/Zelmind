
from django.test import TestCase, Client
from django.contrib.auth.models import User
from home_page.models import Conversation, Message
from allauth.socialaccount.models import SocialToken, SocialAccount, SocialApp
from unittest.mock import patch, MagicMock
from django.urls import reverse
import json

class ErrorMessagingTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='testuser', password='password')
        self.client.force_login(self.user)
        self.convo = Conversation.objects.create(user=self.user)
        # chat_process likely takes no args in URL, receives data in body
        self.url = reverse('home_page:chat_process') 

        # Create SocialToken
        account = SocialAccount.objects.create(user=self.user, provider='google', uid='12345')
        app = SocialApp.objects.create(provider='google', name='Google')
        SocialToken.objects.create(app=app, account=account, token='fake_token')

    @patch('home_page.views.GoogleCalendarService')
    @patch('home_page.views.AIAgent') 
    def test_time_parsing_error(self, MockAIAgent, MockGCalService):
        """Test that invalid time format triggers a user-facing error message."""
        
        mock_service = MockGCalService.return_value
        
        MockAIAgent.return_value.handle.return_value = {
            'type': 'calendar_action_request',
            'content': {
                'action': 'update_event',
                'params': {
                    'match_index': 1,
                    'updates': {'start': 'invalid_time_format'} 
                }
            }
        }
        
        mock_service.list_events.return_value = [{
            'id': 'evt1', 'summary': 'Test Event', 
            'start': {'dateTime': '2023-10-27T10:00:00Z'},
            'end': {'dateTime': '2023-10-27T11:00:00Z'}
        }]

        # Send both potential keys for convo_id to be safe
        data = {
            'message': 'Update event time',
            'conversation_id': str(self.convo.id),
            'convo_id': str(self.convo.id)
        }
        response = self.client.post(self.url, json.dumps(data), content_type='application/json')
        
        # Check standard HTTP response first
        self.assertEqual(response.status_code, 200)

        last_msg = Message.objects.filter(conversation=self.convo, sender='agent').order_by('-created_at').first()
        self.assertIsNotNone(last_msg, "No agent message created")
        self.assertIn("I couldn't understand the start time format provided", last_msg.text)
        self.assertIn("14:00", last_msg.text) # Check for help text

    @patch('home_page.views.GoogleCalendarService')
    @patch('home_page.views.AIAgent')
    def test_master_event_fetching_error(self, MockAIAgent, MockGCalService):
        """Test that failure to fetch master event triggers user-facing error."""
        
        mock_service = MockGCalService.return_value
        MockAIAgent.return_value.handle.return_value = {
            'type': 'calendar_action_request',
            'content': {
                'action': 'update_event',
                'params': {
                    'match_index': 1,
                    'update_series': True,
                    'updates': {'summary': 'New Title'}
                }
            }
        }
        
        mock_service.list_events.return_value = [{
            'id': 'evt1', 'summary': 'Recurring Event', 
            'start': {'dateTime': '2023-10-27T10:00:00Z'},
            'recurringEventId': 'master_evt_id'
        }]
        
        mock_service.get_event.side_effect = Exception("API Error")

        data = {
            'message': 'Update series',
            'conversation_id': str(self.convo.id),
            'convo_id': str(self.convo.id)
        }
        self.client.post(self.url, json.dumps(data), content_type='application/json')
        
        msg_exists = Message.objects.filter(conversation=self.convo, sender='agent', text__contains="I couldn't retrieve the main event for this series").exists()
        self.assertTrue(msg_exists)

    @patch('home_page.views.GoogleCalendarService')
    @patch('home_page.views.AIAgent')
    def test_conflict_checking_error(self, MockAIAgent, MockGCalService):
        """Test that failure during conflict check triggers user-facing error."""
        
        mock_service = MockGCalService.return_value
        MockAIAgent.return_value.handle.return_value = {
            'type': 'calendar_action_request',
            'content': {
                'action': 'update_event',
                'params': {
                    'match_index': 1,
                    'updates': {'start': '10:00am'}
                }
            }
        }
        
        mock_service.list_events.side_effect = [
            [{
                'id': 'evt1', 'summary': 'Test Event', 
                'start': {'dateTime': '2023-10-27T09:00:00Z'},
                'end': {'dateTime': '2023-10-27T10:00:00Z'}
            }],
            Exception("Conflict check failed") 
        ]

        data = {
            'message': 'Update time',
            'conversation_id': str(self.convo.id),
            'convo_id': str(self.convo.id)
        }
        self.client.post(self.url, json.dumps(data), content_type='application/json')
        
        msg_exists = Message.objects.filter(conversation=self.convo, sender='agent', text__contains="I was unable to check for scheduling conflicts").exists()
        self.assertTrue(msg_exists)

    @patch('home_page.views.GoogleCalendarService')
    @patch('home_page.views.AIAgent')
    def test_time_filtering_error(self, MockAIAgent, MockGCalService):
        """Test that error during time filtering triggers user-facing error."""
         
        mock_service = MockGCalService.return_value
        MockAIAgent.return_value.handle.return_value = {
            'type': 'calendar_action_request',
            'content': {
                'action': 'delete_event',
                'params': {
                    'summary': 'Test',
                    'start': '10:00am' 
                }
            }
        }
        
        mock_service.list_events.return_value = [{
            'id': 'evt1', 'summary': 'Test Event', 
            'start': {'dateTime': 'INVALID_Z'} 
        }]
        
        data = {
            'message': 'Delete event',
            'conversation_id': str(self.convo.id),
            'convo_id': str(self.convo.id)
        }
        self.client.post(self.url, json.dumps(data), content_type='application/json')
        
        msg_exists = Message.objects.filter(conversation=self.convo, sender='agent', text__contains="I couldn't filter by the specific time provided").exists()
        self.assertTrue(msg_exists)
