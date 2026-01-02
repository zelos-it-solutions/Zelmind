from django.test import TestCase
from unittest.mock import patch, MagicMock
from django.contrib.auth.models import User
from home_page.services.calendar_service import GoogleCalendarService
import logging

class TestCalendarServiceErrorHandling(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='testuser', password='password')

    @patch('home_page.services.calendar_service.SocialToken')
    @patch('home_page.services.calendar_service.logger')
    def test_init_error_handling(self, mock_logger, mock_social_token):
        # Simulate an error during initialization
        mock_social_token.objects.filter.side_effect = Exception("Database error")

        with self.assertRaises(Exception) as cm:
            GoogleCalendarService(self.user)
        
        self.assertEqual(str(cm.exception), 'Failed to initialize Google Calendar service. Please try again later.')
        
        # Verify logger was called with the original error
        mock_logger.error.assert_called()
        args, _ = mock_logger.error.call_args
        self.assertIn("Failed to initialize Google Calendar service: Database error", args[0])

    @patch('home_page.services.calendar_service.SocialToken')
    @patch('home_page.services.calendar_service.SocialAccount')
    @patch('home_page.services.calendar_service.Credentials')
    @patch('home_page.services.calendar_service.build')
    @patch('home_page.services.calendar_service.logger')
    def test_send_email_error_handling(self, mock_logger, mock_build, mock_creds, mock_social_account, mock_social_token):
        # Setup successful init to get to send_email
        mock_token = MagicMock()
        mock_social_token.objects.filter.return_value.first.return_value = mock_token
        
        # Verify init works (sanity check)
        service = GoogleCalendarService(self.user)
        
        # Now make send_email fail
        # internal build() call inside send_email raises exception
        mock_build.side_effect = Exception("Gmail API error")

        with self.assertRaises(Exception) as cm:
            service.send_email('to@example.com', 'subject', 'body')

        self.assertEqual(str(cm.exception), "Failed to send email. Please try again later.")

        # Verify logger was called
        mock_logger.error.assert_called()
        args, _ = mock_logger.error.call_args
        self.assertIn("Failed to send email: Gmail API error", args[0])
