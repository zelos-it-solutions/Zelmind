from django.apps import AppConfig


class HomePageConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'home_page'

    def ready(self):
        import home_page.signals_debug
        import socket
        import sys
        import logging

        # SINGLETON LOCK MECHANISM
        # Environment variables like RUN_MAIN are unreliable across different OS/Servers.
        # We use a socket binding to ensuring ONLY ONE process ever starts the worker.

        # 1. Skip if running management commands (migrate, shell, etc)
        is_manage_py = any('manage.py' in arg for arg in sys.argv)
        is_runserver = any('runserver' in arg for arg in sys.argv)
        
        # If manage.py is running something other than runserver, we generally don't want the worker
        # UNLESS it is strictly 'runserver'.
        if is_manage_py and not is_runserver:
            return

        # 2. Try to acquire the lock
        # We bind to a specific port. If it fails, another instance is already running.
        try:
            self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.sock.bind(("127.0.0.1", 40123))
        except socket.error:
            # Socket already in use -> Worker is already running in another process
            # Do NOT start a new one.
            return

        # 3. If we got here, we are the ONE TRUE WORKER.
        from .reminder_worker import ReminderWorker
        try:
            # We don't close the socket; we keep it open to hold the lock until process storage.
            # ReminderWorker.start() launches a daemon thread, so it won't block django.
            ReminderWorker.start()
        except Exception as e:
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to start reminder worker: {e}", exc_info=True)
