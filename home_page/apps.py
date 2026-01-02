from django.apps import AppConfig


class HomePageConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'home_page'

    def ready(self):
        import home_page.signals_debug
        
        # Start the background reminder worker if not running via management command
        # Check if in a runserver/gunicorn process (not migration or shell)
        import sys
        is_manage_py = any('manage.py' in arg for arg in sys.argv)
        is_runserver = any('runserver' in arg for arg in sys.argv)
        is_gunicorn = 'gunicorn' in sys.argv[0]
        
        # Control background thread via logic
        # 1. Explicitly enabled via env var
        # 2. Or implicitly enabled in Development (runserver + DEBUG)
        
        import os
        from django.conf import settings
        
        enable_env = os.environ.get('ENABLE_REMINDER_THREAD', '').lower() == 'true'
        disable_env = os.environ.get('ENABLE_REMINDER_THREAD', '').lower() == 'false'
        
        # Logic: Start if enabled explicitly OR (Development env AND not successfully disabled)
        should_start = False
        
        if enable_env:
            should_start = True
        elif not disable_env and settings.DEBUG and is_runserver:
            should_start = True
            
        if should_start:
            from .reminder_worker import ReminderWorker
            try:
                ReminderWorker.start()
            except Exception as e:
                print(f"Failed to start reminder worker: {e}")
