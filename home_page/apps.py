from django.apps import AppConfig


class HomePageConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'home_page'

    def ready(self):
        import home_page.signals_debug
        import socket
        import sys
        import logging

        # 1. Skip if running management commands (migrate, shell, etc)
        is_manage_py = any('manage.py' in arg for arg in sys.argv)
        is_runserver = any('runserver' in arg for arg in sys.argv)
        is_gunicorn = any('gunicorn' in arg for arg in sys.argv[0:2])  # Check first few args for gunicorn executable
        
        if is_manage_py and not is_runserver:
            return

        # If running in production (gunicorn), the Procfile spins up a dedicated 'worker' process
        # via `python manage.py run_reminders`. So the web process MUST NOT run the background thread.
        if is_gunicorn:
            return

        try:
            self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.sock.bind(("127.0.0.1", 40123))
        except socket.error:
            return

        from .reminder_worker import ReminderWorker
        try:
            # ReminderWorker.start() launches a daemon thread, so it won't block django.
            ReminderWorker.start()
        except Exception as e:
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to start reminder worker: {e}", exc_info=True)
